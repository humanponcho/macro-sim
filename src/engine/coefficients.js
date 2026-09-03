/**
 * Macro-Sim v1 coefficients.
 *
 * Every directed link the engine is allowed to use, keyed by the link id in
 * macrosim_model_v1.json. `b` is the SIGNED beta, so an equation reads as a
 * plain sum of contributions and the signs are visible at the call site.
 *
 * `lag` is lagQuarters: 1 reads the previous completed quarter. `width` is how
 * many lagged observations are averaged, which is the ramp.
 *
 * These values are checked against macrosim_model_v1.json by
 * test/model.coefficients.test.js. Do not edit one without the other.
 */

/** @typedef {{ b: number, lag: number, width: number }} Link */

/** @type {Record<string, Link>} */
export const LINK = {
  // --- expectations, computed first, lag 0 (spec 6.1) ---
  r_to_gexp:      { b: -0.30,  lag: 0, width: 1 },
  cred_to_gexp:   { b:  0.05,  lag: 0, width: 1 },
  supply_to_gexp: { b: -0.025, lag: 0, width: 1 },
  g_to_gexp:      { b:  0.45,  lag: 0, width: 1 },

  pi_to_piexp:     { b:  0.45, lag: 0, width: 1 },
  supply_to_piexp: { b:  0.04, lag: 0, width: 1 },
  gexp_to_piexp:   { b:  0.15, lag: 0, width: 1 },
  r_to_piexp:      { b: -0.15, lag: 0, width: 1 },

  // --- tier 1 markets, lag 0 (spec 6.2, 6.3) ---
  r_to_y:     { b: 0.70, lag: 0, width: 1 },
  piexp_to_y: { b: 0.40, lag: 0, width: 1 },
  gexp_to_y:  { b: 0.20, lag: 0, width: 1 },

  r_to_usd:      { b: 2.50, lag: 0, width: 1 },
  gexp_to_usd:   { b: 1.20, lag: 0, width: 1 },
  supply_to_usd: { b: 0.10, lag: 0, width: 1 },

  // --- energy, mixed (spec 6.4) ---
  supply_to_e: { b:  1.00, lag: 0, width: 1 },
  g_to_e:      { b:  4.00, lag: 1, width: 2 },
  usd_to_e:    { b: -0.35, lag: 0, width: 1 },

  // --- credit, tier 2 (spec 6.5) ---
  r_to_cred:   { b: -4.00, lag: 1, width: 2 },
  g_to_cred:   { b:  2.50, lag: 1, width: 2 },
  usd_to_cred: { b: -0.20, lag: 1, width: 2 },

  // --- growth, tier 3 (spec 6.6). No direct policy-rate term, by design. ---
  cred_to_g: { b:  0.07,  lag: 1, width: 3 },
  e_to_g:    { b: -0.035, lag: 1, width: 3 },
  eq_to_g:   { b:  0.015, lag: 1, width: 3 },

  // --- inflation, tier 4 (spec 6.7) ---
  pi_ar:     { b:  0.50, lag: 1, width: 1 },
  e_to_pi:   { b:  0.05, lag: 1, width: 2 },
  g_to_pi:   { b:  0.25, lag: 3, width: 3 },
  usd_to_pi: { b: -0.03, lag: 2, width: 3 },

  // --- equity, tier 1, last in the tick (spec 6.8) ---
  y_to_eq:    { b: -6.00, lag: 0, width: 1 },
  gexp_to_eq: { b:  8.00, lag: 0, width: 1 },
  cred_to_eq: { b:  0.12, lag: 0, width: 1 },
  e_to_eq:    { b: -0.22, lag: 0, width: 1 },
};

/** Baseline levels. Every gap in the model is measured from these. */
export const BASELINE = {
  growth: 2.0,
  inflation: 2.0,
  policyRate: 3.5,
  treasuryYield: 3.8,
  dollar: 100.0,
  credit: 100.0,
  energy: 100.0,
  equity: 100.0,
};

/** Hard bounds. Every variable is clipped to these after each tick. */
export const BOUNDS = {
  growth: [-4.0, 6.0],
  inflation: [-1.0, 15.0],
  policyRate: [0.0, 12.0],
  treasuryYield: [0.2, 15.0],
  dollar: [70.0, 140.0],
  credit: [60.0, 140.0],
  energy: [40.0, 250.0],
  equity: [40.0, 180.0],
};

/** Optional reaction function (spec 8). Off by default. */
export const TAYLOR = {
  rStar: 3.5,
  piStar: 2.0,
  gStar: 2.0,
  weightInflation: 1.5,
  weightGrowth: 0.5,
  maxStepPerQuarter: 0.5,
};

/** The variables the engine carries as state. */
export const VARIABLES = Object.keys(BASELINE);

/** Quarters of gap history pre-filled with zeros, so averages work from Q1. */
export const PRESAMPLE_QUARTERS = 8;
