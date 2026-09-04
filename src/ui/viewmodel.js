/**
 * The view model: snapshot plus content, turned into rows a renderer can draw.
 *
 * Everything here is pure. It does no DOM work and holds no economics, so the
 * screen can be tested without a browser. src/ui/render.js is deliberately
 * dumb: it walks these structures and writes elements.
 */

import {
  formatValue,
  formatChange,
  clampForDisplay,
  targetIsOffScale,
  rankContributions,
  pipelineProgress,
  baselineFor,
} from "../display/format.js";
import { BASELINE } from "../engine/coefficients.js";
import { TARGET_VARIABLES } from "../engine/engine.js";

/** The eight currents, in the order the lesson lists its master variables. */
export const TILE_ORDER = [
  "growth",
  "inflation",
  "policyRate",
  "treasuryYield",
  "dollar",
  "credit",
  "energy",
  "equity",
];

const nearlyEqual = (a, b, tolerance = 0.005) => Math.abs(a - b) < tolerance;

/** One tile per current: level, change since last quarter, and its label. */
export function buildTiles(snapshot, previous, content) {
  return TILE_ORDER.map((id) => {
    const meta = content.variables[id];
    const before = previous ? previous[id] : BASELINE[id];
    const delta = snapshot[id] - before;

    return {
      id,
      label: meta.label,
      short: meta.short ?? meta.label,
      question: meta.question,
      plain: meta.plain,
      role: meta.role,
      layer: meta.layer,
      value: formatValue(id, snapshot[id]),
      change: formatChange(id, delta),
      moved: !nearlyEqual(snapshot[id], before, 1e-9),
      direction: Math.sign(Number(delta.toFixed(4))),
      atBaseline: nearlyEqual(snapshot[id], BASELINE[id], 1e-9),
    };
  });
}

/** Expected against printed, side by side, for growth and inflation. */
export function buildExpectations(snapshot, content) {
  return [
    { expectation: "gExp", printed: "growth" },
    { expectation: "piExp", printed: "inflation" },
  ].map(({ expectation, printed }) => {
    const expected = formatValue(expectation, snapshot[expectation]);
    const printedValue = formatValue(printed, snapshot[printed]);

    return {
      id: expectation,
      label: content.variables[expectation].label,
      printedLabel: content.variables[printed].label,
      expected,
      printedValue,
      // Flagged at display precision: if the two print the same, a reader
      // cannot see a divergence, so the screen must not claim one.
      diverged: expected !== printedValue,
    };
  });
}

/**
 * The pipeline meter: where a delayed variable is now, and where it is heading.
 * The engine leaves targets unclipped, so the meter clamps and says when it had
 * to rather than drawing a number that is off its own scale.
 */
export function buildPipeline(snapshot, content) {
  return TARGET_VARIABLES.map((id) => {
    const current = snapshot[id];
    const rawTarget = snapshot.target[id];
    const shownTarget = clampForDisplay(id, rawTarget);
    const baseline = baselineFor(id);

    const currentText = formatValue(id, current);
    const targetText = formatValue(id, shownTarget);
    // Decided at display precision. When current and target print the same,
    // the meter shows one number twice; saying "still moving" beside that
    // would be a claim the reader can see is false.
    const inFlight = currentText !== targetText;

    return {
      id,
      label: content.variables[id].label,
      current: currentText,
      target: targetText,
      offScale: targetIsOffScale(id, rawTarget),
      progress: pipelineProgress(current, shownTarget, baseline),
      inFlight,
      direction: inFlight ? Math.sign(shownTarget - current) : 0,
      lag: content.variables[id].lag,
    };
  });
}

/**
 * Why did this move? One bar per link, largest absolute effect first, zeros
 * kept. A contribution of zero is a fact: the channel exists and had nothing to
 * say this quarter, usually because it reads an earlier one.
 */
export function buildAttribution(snapshot, variable, content) {
  const terms = snapshot.contributions[variable];
  if (!terms) throw new Error(`no contributions for "${variable}"`);

  const ranked = rankContributions(terms);
  const widest = Math.max(...ranked.map((term) => Math.abs(term.value)), 0);
  const net = ranked.reduce((total, term) => total + term.value, 0);

  return {
    variable,
    label: content.variables[variable].label,
    value: formatValue(variable, snapshot[variable]),
    net: formatChange(variable, net),
    baseline: formatValue(variable, baselineFor(variable)),
    terms: ranked.map((term) => ({
      id: term.id,
      label: content.links[term.id].label,
      plain: content.links[term.id].plain,
      value: formatChange(variable, term.value),
      // Share of the widest bar, so the bars are comparable within one panel.
      weight: widest === 0 ? 0 : Math.abs(term.value) / widest,
      direction: Math.sign(Number(term.value.toFixed(6))),
      isZero: term.value === 0,
    })),
  };
}

/** Which variables can be explained. The policy rate is an input, not an output. */
export function explainableVariables(snapshot) {
  return Object.keys(snapshot.contributions);
}

/**
 * The banner above the screen.
 *
 * The shock-quarter line is the most valuable sentence in the app, so it is
 * derived rather than hard-coded to quarter one: it shows whenever markets have
 * moved and the real economy has not yet followed.
 */
export function bannerFor(snapshot, content) {
  if (!snapshot) return { kind: "baseline", text: content.copy.banners.baseline };

  const realEconomyStill =
    nearlyEqual(snapshot.growth, BASELINE.growth) &&
    nearlyEqual(snapshot.inflation, BASELINE.inflation) &&
    nearlyEqual(snapshot.credit, BASELINE.credit);

  const marketsMoved =
    !nearlyEqual(snapshot.treasuryYield, BASELINE.treasuryYield, 1e-9) ||
    !nearlyEqual(snapshot.equity, BASELINE.equity, 1e-9) ||
    !nearlyEqual(snapshot.dollar, BASELINE.dollar, 1e-9);

  if (realEconomyStill && marketsMoved) {
    return { kind: "shock", text: content.copy.banners.shockQuarter };
  }

  const anyOffScale = TARGET_VARIABLES.some((id) =>
    targetIsOffScale(id, snapshot.target[id]),
  );
  if (anyOffScale) {
    return { kind: "offScale", text: content.copy.banners.offScaleTarget };
  }

  if (snapshot.policyMode === "taylor") {
    return { kind: "rule", text: content.copy.banners.ruleActive };
  }

  return null;
}

/** Everything the screen needs for one quarter. */
export function buildScreen(snapshots, { explaining = "equity" }, content) {
  const snapshot = snapshots[snapshots.length - 1] ?? null;
  const previous = snapshots[snapshots.length - 2] ?? null;

  if (!snapshot) {
    return {
      quarter: 0,
      banner: bannerFor(null, content),
      tiles: null,
      expectations: null,
      pipeline: null,
      attribution: null,
    };
  }

  return {
    quarter: snapshot.quarter,
    policyMode: snapshot.policyMode,
    banner: bannerFor(snapshot, content),
    tiles: buildTiles(snapshot, previous, content),
    expectations: buildExpectations(snapshot, content),
    pipeline: buildPipeline(snapshot, content),
    attribution: buildAttribution(snapshot, explaining, content),
    explainable: explainableVariables(snapshot),
  };
}
