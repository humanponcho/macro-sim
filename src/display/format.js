/**
 * Display rules for the Simulate screen.
 *
 * The engine keeps full floats (spec 14). This module is the only place that
 * decides how a number reaches a reader. It holds no coefficients and does no
 * economics; it exists so three invariants are enforced once, not per component:
 *
 *   1. Two decimals on percentage variables, one on index variables (spec 14).
 *   2. A minus sign never appears on a zero.
 *   3. Targets are clamped to the bounds for display; the engine leaves them
 *      unclipped, because they describe what the equation asked for.
 */

import { BOUNDS, BASELINE } from "../engine/coefficients.js";

/** Percentage variables print two decimals; index variables print one. */
export const UNIT = {
  growth: "percent",
  inflation: "percent",
  policyRate: "percent",
  treasuryYield: "percent",
  gExp: "percent",
  piExp: "percent",
  dollar: "index",
  credit: "index",
  energy: "index",
  equity: "index",
};

const DECIMALS = { percent: 2, index: 1 };

/** Decimal places for a variable, per spec 14. */
export function decimalsFor(name) {
  const unit = UNIT[name];
  if (!unit) throw new Error(`display: unknown variable "${name}"`);
  return DECIMALS[unit];
}

/**
 * Round for display without ever producing a signed zero.
 *
 * The engine already normalises an exact -0. This catches the other case: a
 * value small enough to round to zero, such as -0.001, which toFixed() renders
 * as "-0.00". On a screen that reads as a fall, and there was no fall.
 */
export function formatValue(name, value) {
  const places = decimalsFor(name);
  const text = value.toFixed(places);
  return Number(text) === 0 ? (0).toFixed(places) : text;
}

/**
 * A change, with an explicit sign, for a tile or a contribution bar.
 * A genuine zero prints without a sign, because zero is a fact worth reading:
 * it means the channel exists and contributed nothing this quarter.
 */
export function formatChange(name, delta) {
  const places = decimalsFor(name);
  const rounded = Number(delta.toFixed(places));

  if (rounded === 0) return (0).toFixed(places);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(places)}`;
}

/**
 * Clamp a target to the variable's bounds, for display only.
 *
 * The engine leaves targets unclipped on purpose: an unclipped target says what
 * today's drivers are asking for, even when the model would not let the current
 * go there. A meter cannot draw past its own scale, so it clamps.
 */
export function clampForDisplay(name, value) {
  const range = BOUNDS[name];
  if (!range) throw new Error(`display: no bounds for "${name}"`);
  const [lo, hi] = range;
  return Math.max(lo, Math.min(hi, value));
}

/** True when the engine's target sits outside the bounds and was clamped. */
export function targetIsOffScale(name, value) {
  return clampForDisplay(name, value) !== value;
}

/**
 * Contributions ordered for reading: largest absolute effect first.
 *
 * Zero terms are kept and sorted last. A contribution of 0 is a fact, not a
 * missing channel: in the quarter of a rate rise, credit contributes exactly
 * nothing to equity, and that zero is the lesson.
 */
export function rankContributions(terms) {
  return Object.entries(terms)
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** How far a delayed variable has travelled from its current to its target. */
export function pipelineProgress(current, target, baseline) {
  const distance = target - baseline;
  if (Math.abs(distance) < 1e-12) return 1;
  const travelled = (current - baseline) / distance;
  return Math.max(0, Math.min(1, travelled));
}

/** The baseline a variable is measured against, for meters and change tiles. */
export function baselineFor(name) {
  if (name === "gExp") return BASELINE.growth;
  if (name === "piExp") return BASELINE.inflation;
  return BASELINE[name];
}
