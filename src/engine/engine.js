/**
 * Macro-Sim Economic Model v1 — quarterly teaching engine.
 *
 * One tick is one quarter. simulateQuarter() is deterministic and pure: the
 * same state with the same inputs always gives the same next state.
 *
 * This is a teaching model, not a forecast. The magnitudes are chosen to make
 * transmission visible over six to eight quarters. They are not estimates.
 *
 * Port of macrosim_engine_v1.py, which is the oracle for the golden tests.
 */

import {
  LINK,
  BASELINE,
  BOUNDS,
  TAYLOR,
  VARIABLES,
  PRESAMPLE_QUARTERS,
} from "./coefficients.js";

/** Clip a value to the variable's bounds. */
export function clip(name, value) {
  const [lo, hi] = BOUNDS[name];
  return Math.max(lo, Math.min(hi, value));
}

/**
 * One gap out of history. lag 0 is the previous completed quarter, because
 * history is appended at the end of each tick and never includes this one.
 * Reads before the start of the record return 0.
 */
function gapAt(history, name, lag) {
  const series = history[name];
  const index = series.length - 1 - lag;
  return index < 0 ? 0 : series[index];
}

/**
 * Lagged moving average of a gap. lagQuarters 1 starts at the previous
 * completed quarter. width is the number of observations averaged, which is
 * how the ramp is produced.
 */
function maGap(history, name, lagQuarters, width) {
  const start = Math.max(lagQuarters - 1, 0);
  let total = 0;
  for (let i = start; i < start + width; i += 1) total += gapAt(history, name, i);
  return total / width;
}

/** A fresh state at baseline, quarter zero. */
export function initialState({ policyMode = "manual" } = {}) {
  const history = {};
  for (const name of VARIABLES) history[name] = new Array(PRESAMPLE_QUARTERS).fill(0);
  return {
    quarter: 0,
    values: { ...BASELINE },
    energySupplyGap: 0,
    policyMode,
    history,
  };
}

/**
 * Advance one quarter.
 *
 * @param {object} state    from initialState() or a previous call
 * @param {object} [inputs] { policyRate, energySupplyGap, policyMode }
 * @returns {object} the next state. `state` is not modified.
 */
export function simulateQuarter(state, inputs = {}) {
  // --- 1. apply inputs. Both persist until changed. ---
  const values = { ...state.values };
  const policyMode = inputs.policyMode ?? state.policyMode;
  let energySupplyGap = state.energySupplyGap;

  if (inputs.policyRate !== undefined && inputs.policyRate !== null) {
    values.policyRate = clip("policyRate", inputs.policyRate);
  }
  if (inputs.energySupplyGap !== undefined && inputs.energySupplyGap !== null) {
    energySupplyGap = inputs.energySupplyGap;
  }

  const history = state.history;
  const supply = energySupplyGap;

  let rate = values.policyRate;
  let rateGap = rate - BASELINE.policyRate;
  const growthGap = values.growth - BASELINE.growth;
  const inflationGap = values.inflation - BASELINE.inflation;
  const creditGap = values.credit - BASELINE.credit;

  // --- 2. expectations, lag 0. Markets price these, not last year's print. ---
  const expectations = () => {
    const gExp =
      BASELINE.growth +
      LINK.r_to_gexp.b * rateGap +
      LINK.cred_to_gexp.b * creditGap +
      LINK.supply_to_gexp.b * supply +
      LINK.g_to_gexp.b * growthGap;

    const piExp =
      BASELINE.inflation +
      LINK.pi_to_piexp.b * inflationGap +
      LINK.supply_to_piexp.b * supply +
      LINK.gexp_to_piexp.b * (gExp - BASELINE.growth) +
      LINK.r_to_piexp.b * rateGap;

    return { gExp, piExp };
  };

  let { gExp, piExp } = expectations();

  // --- 3. optional reaction function, then reprice expectations (spec 8) ---
  if (policyMode === "taylor") {
    const desired =
      TAYLOR.rStar +
      TAYLOR.weightInflation * (piExp - TAYLOR.piStar) +
      TAYLOR.weightGrowth * (gExp - TAYLOR.gStar);
    const step = Math.max(
      -TAYLOR.maxStepPerQuarter,
      Math.min(TAYLOR.maxStepPerQuarter, desired - rate),
    );
    rate = clip("policyRate", rate + step);
    values.policyRate = rate;
    rateGap = rate - BASELINE.policyRate;
    ({ gExp, piExp } = expectations());
  }

  const gExpGap = gExp - BASELINE.growth;
  const piExpGap = piExp - BASELINE.inflation;

  /** Contribution of one delayed link, using its own lag and width. */
  const lagged = (id, name) =>
    LINK[id].b * maGap(history, name, LINK[id].lag, LINK[id].width);

  // --- 4. tier 1 markets, same quarter as the shock (spec 6.2, 6.3) ---
  const treasuryYield =
    BASELINE.treasuryYield +
    LINK.r_to_y.b * rateGap +
    LINK.piexp_to_y.b * piExpGap +
    LINK.gexp_to_y.b * gExpGap;

  const dollar =
    BASELINE.dollar +
    LINK.r_to_usd.b * rateGap +
    LINK.gexp_to_usd.b * gExpGap +
    LINK.supply_to_usd.b * supply;

  const dollarGapNow = dollar - BASELINE.dollar;

  // --- 5. energy. Supply is immediate; demand follows growth with a lag. ---
  const energy =
    BASELINE.energy +
    LINK.supply_to_e.b * supply +
    lagged("g_to_e", "growth") +
    LINK.usd_to_e.b * dollarGapNow;

  // --- 6. credit, tier 2, lag 1 (spec 6.5) ---
  const credit =
    BASELINE.credit +
    lagged("r_to_cred", "policyRate") +
    lagged("g_to_cred", "growth") +
    lagged("usd_to_cred", "dollar");

  // --- 7. growth, tier 3. Rates reach growth only through these channels. ---
  const growth =
    BASELINE.growth +
    lagged("cred_to_g", "credit") +
    lagged("e_to_g", "energy") +
    lagged("eq_to_g", "equity");

  // --- 8. inflation, tier 4, mixed lags plus persistence (spec 6.7) ---
  const inflation =
    BASELINE.inflation +
    lagged("pi_ar", "inflation") +
    lagged("e_to_pi", "energy") +
    lagged("g_to_pi", "growth") +
    lagged("usd_to_pi", "dollar");

  // --- 9. equity, last in the tick, on this quarter's yield, credit, energy ---
  const equity =
    BASELINE.equity +
    LINK.y_to_eq.b * (treasuryYield - BASELINE.treasuryYield) +
    LINK.gexp_to_eq.b * gExpGap +
    LINK.cred_to_eq.b * (credit - BASELINE.credit) +
    LINK.e_to_eq.b * (energy - BASELINE.energy);

  // --- 10. clip every current value ---
  const next = {
    growth: clip("growth", growth),
    inflation: clip("inflation", inflation),
    policyRate: clip("policyRate", rate),
    treasuryYield: clip("treasuryYield", treasuryYield),
    dollar: clip("dollar", dollar),
    credit: clip("credit", credit),
    energy: clip("energy", energy),
    equity: clip("equity", equity),
  };

  // --- 11. append gaps to history, then snapshot ---
  const nextHistory = {};
  for (const name of VARIABLES) {
    nextHistory[name] = [...history[name], next[name] - BASELINE[name]];
  }

  const quarter = state.quarter + 1;

  return {
    quarter,
    values: next,
    energySupplyGap,
    policyMode,
    history: nextHistory,
    snapshot: {
      quarter,
      ...next,
      gExp,
      piExp,
      energySupplyGap,
      policyMode,
    },
  };
}

/**
 * Run a scenario: a starting state plus an ordered list of quarterly inputs.
 *
 * A tape entry applies at the START of its quarter and then persists, so a
 * held shock needs one entry. Stepping back a quarter means replaying this
 * from quarter zero, never inverting the arithmetic.
 *
 * @param {Array<{quarter:number, policyRate?:number, energySupplyGap?:number}>} tape
 * @param {{quarters?:number, policyMode?:string}} [options]
 * @returns {Array<object>} one snapshot per quarter, oldest first
 */
export function runTape(tape = [], { quarters = 8, policyMode = "manual" } = {}) {
  let state = initialState({ policyMode });
  const snapshots = [];

  for (let quarter = 1; quarter <= quarters; quarter += 1) {
    const inputs = {};
    for (const entry of tape) {
      if (entry.quarter !== quarter) continue;
      if (entry.policyRate !== undefined) inputs.policyRate = entry.policyRate;
      if (entry.energySupplyGap !== undefined) {
        inputs.energySupplyGap = entry.energySupplyGap;
      }
    }
    state = simulateQuarter(state, inputs);
    snapshots.push(state.snapshot);
  }

  return snapshots;
}

/** The baseline row, for charts and tables that show quarter zero. */
export function baselineSnapshot() {
  return {
    quarter: 0,
    ...BASELINE,
    gExp: BASELINE.growth,
    piExp: BASELINE.inflation,
    energySupplyGap: 0,
    policyMode: "manual",
  };
}
