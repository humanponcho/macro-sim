/**
 * Macro-Sim Economic Model v1 — quarterly teaching engine.
 *
 * One tick is one quarter. simulateQuarter() is deterministic and pure: the
 * same state with the same inputs always gives the same next state, and the
 * state you pass in is never modified.
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

/**
 * The baseline each contribution set is measured from. Adding the baseline to
 * the sum of a variable's contributions gives that variable's current level.
 * Expectations are measured from the same baseline as the variable they price.
 */
export const CONTRIBUTION_BASE = {
  treasuryYield: BASELINE.treasuryYield,
  dollar: BASELINE.dollar,
  equity: BASELINE.equity,
  credit: BASELINE.credit,
  growth: BASELINE.growth,
  inflation: BASELINE.inflation,
  energy: BASELINE.energy,
  gExp: BASELINE.growth,
  piExp: BASELINE.inflation,
};

/** The delayed variables that have a target. Markets are already at theirs. */
export const TARGET_VARIABLES = ["credit", "growth", "inflation", "energy"];

/**
 * Normalise negative zero. A term of exactly -0 is arithmetically zero but
 * renders as "-0.00", which reads on screen as a real move. Applied only to
 * the reported contributions, so the currents stay bit-identical.
 */
function noNegativeZero(terms) {
  const out = {};
  for (const [id, value] of Object.entries(terms)) out[id] = value === 0 ? 0 : value;
  return out;
}

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

/**
 * The long-run level each delayed variable is heading for, if today's drivers
 * never moved again and every lag had fully landed (spec 3).
 *
 * This is the same equation as the current, with lag 0 and width 1, read off
 * this tick's currents. The gap between current and target is what a lag looks
 * like on screen. Targets are not clipped to the bounds; a caller that draws a
 * meter should clamp for display.
 */
export function computeTargets(values, energySupplyGap) {
  const rateGap = values.policyRate - BASELINE.policyRate;
  const growthGap = values.growth - BASELINE.growth;
  const dollarGap = values.dollar - BASELINE.dollar;
  const creditGap = values.credit - BASELINE.credit;
  const energyGap = values.energy - BASELINE.energy;
  const equityGap = values.equity - BASELINE.equity;

  // Persistence compounds a cost shock in steady state. With pi_ar at 0.50
  // this is the 2x the spec writes out by hand.
  const persistence = 1 / (1 - LINK.pi_ar.b);

  return {
    credit:
      BASELINE.credit +
      LINK.r_to_cred.b * rateGap +
      LINK.g_to_cred.b * growthGap +
      LINK.usd_to_cred.b * dollarGap,

    growth:
      BASELINE.growth +
      LINK.cred_to_g.b * creditGap +
      LINK.e_to_g.b * energyGap +
      LINK.eq_to_g.b * equityGap,

    inflation:
      BASELINE.inflation +
      persistence *
        (LINK.e_to_pi.b * energyGap +
          LINK.g_to_pi.b * growthGap +
          LINK.usd_to_pi.b * dollarGap),

    energy:
      BASELINE.energy +
      LINK.supply_to_e.b * energySupplyGap +
      LINK.g_to_e.b * growthGap +
      LINK.usd_to_e.b * dollarGap,
  };
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
 * Every equation in the model is linear, so each variable's level splits
 * exactly into one contribution per link. The snapshot carries that split, so
 * a screen can answer "why did this move?" without repeating any arithmetic.
 *
 * The contributions describe the equation before clipping. If a bound binds,
 * the sum reports the level the equation asked for, not the clipped current.
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
    const gExpTerms = {
      r_to_gexp: LINK.r_to_gexp.b * rateGap,
      cred_to_gexp: LINK.cred_to_gexp.b * creditGap,
      supply_to_gexp: LINK.supply_to_gexp.b * supply,
      g_to_gexp: LINK.g_to_gexp.b * growthGap,
    };

    const gExp =
      BASELINE.growth +
      gExpTerms.r_to_gexp +
      gExpTerms.cred_to_gexp +
      gExpTerms.supply_to_gexp +
      gExpTerms.g_to_gexp;

    const piExpTerms = {
      pi_to_piexp: LINK.pi_to_piexp.b * inflationGap,
      supply_to_piexp: LINK.supply_to_piexp.b * supply,
      gexp_to_piexp: LINK.gexp_to_piexp.b * (gExp - BASELINE.growth),
      r_to_piexp: LINK.r_to_piexp.b * rateGap,
    };

    const piExp =
      BASELINE.inflation +
      piExpTerms.pi_to_piexp +
      piExpTerms.supply_to_piexp +
      piExpTerms.gexp_to_piexp +
      piExpTerms.r_to_piexp;

    return { gExp, piExp, gExpTerms, piExpTerms };
  };

  let { gExp, piExp, gExpTerms, piExpTerms } = expectations();

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
    ({ gExp, piExp, gExpTerms, piExpTerms } = expectations());
  }

  const gExpGap = gExp - BASELINE.growth;
  const piExpGap = piExp - BASELINE.inflation;

  /** Contribution of one delayed link, using its own lag and width. */
  const lagged = (id, name) =>
    LINK[id].b * maGap(history, name, LINK[id].lag, LINK[id].width);

  // --- 4. tier 1 markets, same quarter as the shock (spec 6.2, 6.3) ---
  const yieldTerms = {
    r_to_y: LINK.r_to_y.b * rateGap,
    piexp_to_y: LINK.piexp_to_y.b * piExpGap,
    gexp_to_y: LINK.gexp_to_y.b * gExpGap,
  };

  const treasuryYield =
    BASELINE.treasuryYield +
    yieldTerms.r_to_y +
    yieldTerms.piexp_to_y +
    yieldTerms.gexp_to_y;

  const dollarTerms = {
    r_to_usd: LINK.r_to_usd.b * rateGap,
    gexp_to_usd: LINK.gexp_to_usd.b * gExpGap,
    supply_to_usd: LINK.supply_to_usd.b * supply,
  };

  const dollar =
    BASELINE.dollar +
    dollarTerms.r_to_usd +
    dollarTerms.gexp_to_usd +
    dollarTerms.supply_to_usd;

  const dollarGapNow = dollar - BASELINE.dollar;

  // --- 5. energy. Supply is immediate; demand follows growth with a lag. ---
  const energyTerms = {
    supply_to_e: LINK.supply_to_e.b * supply,
    g_to_e: lagged("g_to_e", "growth"),
    usd_to_e: LINK.usd_to_e.b * dollarGapNow,
  };

  const energy =
    BASELINE.energy +
    energyTerms.supply_to_e +
    energyTerms.g_to_e +
    energyTerms.usd_to_e;

  // --- 6. credit, tier 2, lag 1 (spec 6.5) ---
  const creditTerms = {
    r_to_cred: lagged("r_to_cred", "policyRate"),
    g_to_cred: lagged("g_to_cred", "growth"),
    usd_to_cred: lagged("usd_to_cred", "dollar"),
  };

  const credit =
    BASELINE.credit +
    creditTerms.r_to_cred +
    creditTerms.g_to_cred +
    creditTerms.usd_to_cred;

  // --- 7. growth, tier 3. Rates reach growth only through these channels. ---
  const growthTerms = {
    cred_to_g: lagged("cred_to_g", "credit"),
    e_to_g: lagged("e_to_g", "energy"),
    eq_to_g: lagged("eq_to_g", "equity"),
  };

  const growth =
    BASELINE.growth +
    growthTerms.cred_to_g +
    growthTerms.e_to_g +
    growthTerms.eq_to_g;

  // --- 8. inflation, tier 4, mixed lags plus persistence (spec 6.7) ---
  const inflationTerms = {
    pi_ar: lagged("pi_ar", "inflation"),
    e_to_pi: lagged("e_to_pi", "energy"),
    g_to_pi: lagged("g_to_pi", "growth"),
    usd_to_pi: lagged("usd_to_pi", "dollar"),
  };

  const inflation =
    BASELINE.inflation +
    inflationTerms.pi_ar +
    inflationTerms.e_to_pi +
    inflationTerms.g_to_pi +
    inflationTerms.usd_to_pi;

  // --- 9. equity, last in the tick, on this quarter's yield, credit, energy ---
  const equityTerms = {
    y_to_eq: LINK.y_to_eq.b * (treasuryYield - BASELINE.treasuryYield),
    gexp_to_eq: LINK.gexp_to_eq.b * gExpGap,
    cred_to_eq: LINK.cred_to_eq.b * (credit - BASELINE.credit),
    e_to_eq: LINK.e_to_eq.b * (energy - BASELINE.energy),
  };

  const equity =
    BASELINE.equity +
    equityTerms.y_to_eq +
    equityTerms.gexp_to_eq +
    equityTerms.cred_to_eq +
    equityTerms.e_to_eq;

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
      target: computeTargets(next, energySupplyGap),
      contributions: {
        treasuryYield: noNegativeZero(yieldTerms),
        dollar: noNegativeZero(dollarTerms),
        equity: noNegativeZero(equityTerms),
        credit: noNegativeZero(creditTerms),
        growth: noNegativeZero(growthTerms),
        inflation: noNegativeZero(inflationTerms),
        energy: noNegativeZero(energyTerms),
        gExp: noNegativeZero(gExpTerms),
        piExp: noNegativeZero(piExpTerms),
      },
    },
  };
}

/**
 * Run a scenario: a starting state plus an ordered list of quarterly inputs.
 *
 * A tape entry applies at the START of its quarter and then persists, so a
 * held shock needs one entry.
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

/**
 * Step back one quarter by replaying the tape, never by inverting the
 * arithmetic. The tape is the source of truth; the history arrays stay an
 * implementation detail inside simulateQuarter().
 *
 * @param {Array<object>} tape
 * @param {number} currentQuarter the quarter now on screen
 * @param {{policyMode?:string}} [options]
 * @returns {Array<object>} snapshots up to the previous quarter, empty at Q1
 */
export function stepBack(tape = [], currentQuarter = 0, options = {}) {
  const quarters = Math.max(currentQuarter - 1, 0);
  return runTape(tape, { ...options, quarters });
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
    target: computeTargets(BASELINE, 0),
    contributions: null,
  };
}
