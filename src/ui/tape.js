/**
 * Tape editing.
 *
 * The tape is the only state the screen keeps. Everything visible is derived by
 * replaying it, so these helpers are the whole of the app's mutation logic and
 * they are pure, which means they can be tested without a browser.
 *
 * There are two ways to drive the model, and they must not fight:
 *
 *   Driving   you move the controls, and each advance records what changed.
 *   Playing   a shock card supplies the whole tape, and advancing just reveals
 *             the next quarter. Touching a control takes the wheel back.
 */

import { runTape } from "../engine/engine.js";
import { BASELINE } from "../engine/coefficients.js";

/** Drop everything after `quarter`. Used when stepping back or taking over. */
export function truncate(tape, quarter) {
  return tape.filter((entry) => entry.quarter <= quarter);
}

/** Add or replace the entry for its quarter, keeping the tape ordered. */
export function withEntry(tape, entry) {
  if (!entry) return tape;
  return [...tape.filter((e) => e.quarter !== entry.quarter), entry].sort(
    (a, b) => a.quarter - b.quarter,
  );
}

/** What the inputs actually are at the end of `quarter`, according to the tape. */
export function effectiveInputs(tape, quarter, policyMode = "manual") {
  if (quarter <= 0) {
    return { policyRate: BASELINE.policyRate, energySupplyGap: 0 };
  }

  const path = runTape(tape, { quarters: quarter, policyMode });
  const last = path[path.length - 1];

  return last
    ? { policyRate: last.policyRate, energySupplyGap: last.energySupplyGap }
    : { policyRate: BASELINE.policyRate, energySupplyGap: 0 };
}

/**
 * An entry for the next quarter, or null when nothing has changed.
 *
 * Returning null matters: an input that has not moved must not be written to
 * the tape, or replaying a shock card would overwrite the card's own entries
 * with whatever the sliders happened to be showing.
 */
export function stageEntry({ tape, quarter, policyRate, energySupplyGap, policyMode }) {
  const now = effectiveInputs(tape, quarter, policyMode);
  const entry = { quarter: quarter + 1 };

  if (policyRate !== now.policyRate) entry.policyRate = policyRate;
  if (energySupplyGap !== now.energySupplyGap) entry.energySupplyGap = energySupplyGap;

  return Object.keys(entry).length > 1 ? entry : null;
}

/** The furthest quarter the tape has anything to say about. */
export function tapeLength(tape) {
  return tape.reduce((furthest, entry) => Math.max(furthest, entry.quarter), 0);
}
