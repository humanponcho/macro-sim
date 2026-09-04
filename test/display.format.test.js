/**
 * Display rules.
 *
 * These guard the three invariants the snapshot contract depends on at the
 * screen edge: spec-14 rounding, no signed zero, and clamped targets.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  UNIT,
  decimalsFor,
  formatValue,
  formatChange,
  clampForDisplay,
  targetIsOffScale,
  rankContributions,
  pipelineProgress,
  baselineFor,
} from "../src/display/format.js";
import { runTape } from "../src/engine/engine.js";
import { BASELINE, VARIABLES } from "../src/engine/coefficients.js";

const hike = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 8 });

describe("spec 14 rounding", () => {
  test("percentage variables print two decimals, indices print one", () => {
    assert.equal(formatValue("policyRate", 4.5), "4.50");
    assert.equal(formatValue("treasuryYield", 4.362), "4.36");
    assert.equal(formatValue("growth", 1.9421), "1.94");
    assert.equal(formatValue("equity", 94.39277999), "94.4");
    assert.equal(formatValue("credit", 95.572), "95.6");
    assert.equal(formatValue("energy", 99.251), "99.3");
  });

  test("every engine variable has a unit", () => {
    for (const name of VARIABLES) assert.ok(UNIT[name], `${name} has no unit`);
    assert.equal(decimalsFor("gExp"), 2);
    assert.equal(decimalsFor("piExp"), 2);
  });

  test("an unknown variable is a loud error, not a silent default", () => {
    assert.throws(() => decimalsFor("nope"), /unknown variable/);
  });
});

describe("a minus sign never reaches a zero", () => {
  test("exact negative zero", () => {
    assert.equal(formatValue("equity", -0), "0.0");
    assert.equal(formatChange("equity", -0), "0.0");
  });

  test("a value too small to show, which toFixed would sign", () => {
    // This is the case the engine-side fix does not catch.
    assert.equal((-0.001).toFixed(2), "-0.00", "the hazard still exists in toFixed");

    assert.equal(formatValue("growth", -0.001), "0.00");
    assert.equal(formatChange("growth", -0.001), "0.00");
    assert.equal(formatChange("equity", -0.04), "0.0");
  });

  test("a real move keeps its sign", () => {
    assert.equal(formatChange("equity", -5.607), "−5.6");
    assert.equal(formatChange("equity", 5.607), "+5.6");
    assert.equal(formatChange("growth", -0.42), "−0.42");
  });

  test("no contribution in a held hike ever formats with a signed zero", () => {
    for (const snapshot of hike) {
      for (const [variable, terms] of Object.entries(snapshot.contributions)) {
        for (const [id, value] of Object.entries(terms)) {
          const text = formatChange(variable, value);
          assert.ok(
            !text.startsWith("−0.0") || Number(text.slice(1)) !== 0,
            `Q${snapshot.quarter} ${variable}.${id} formatted as ${text}`,
          );
        }
      }
    }
  });
});

describe("zero is a fact, not a missing channel", () => {
  test("a zero contribution is kept and printed unsigned", () => {
    const terms = hike[0].contributions.equity;

    assert.equal(terms.cred_to_eq, 0);
    assert.equal(formatChange("equity", terms.cred_to_eq), "0.0");
  });

  test("ranking keeps zero terms and sorts them last", () => {
    const ranked = rankContributions(hike[0].contributions.equity);

    assert.equal(ranked.length, 4, "no term may be dropped");
    assert.equal(ranked[0].id, "y_to_eq", "the discount rate leads");
    assert.equal(ranked[1].id, "gexp_to_eq");
    assert.equal(ranked[3].id, "cred_to_eq", "the zero sorts last");
    assert.equal(ranked[3].value, 0);
  });
});

describe("targets are clamped for display only", () => {
  test("a target inside the bounds is untouched", () => {
    const target = hike[0].target.credit;

    assert.equal(clampForDisplay("credit", target), target);
    assert.equal(targetIsOffScale("credit", target), false);
  });

  test("a target the equation asks for beyond the bound is clamped and flagged", () => {
    // Bounds: credit 60 to 140, growth -4 to 6.
    assert.equal(clampForDisplay("credit", 41.2), 60);
    assert.equal(targetIsOffScale("credit", 41.2), true);
    assert.equal(clampForDisplay("growth", -9), -4);
  });

  test("an extreme sustained shock produces an off-scale target, not a wrong one", () => {
    const extreme = runTape([{ quarter: 1, policyRate: 12, energySupplyGap: 140 }], {
      quarters: 12,
    });
    const last = extreme[extreme.length - 1];

    // The engine reports what the equation asked for; the screen clamps.
    assert.ok(
      Object.keys(last.target).some((name) => targetIsOffScale(name, last.target[name])),
      "an extreme run should push at least one target off scale",
    );
    for (const name of Object.keys(last.target)) {
      const shown = clampForDisplay(name, last.target[name]);
      assert.ok(Number.isFinite(shown));
    }
  });
});

describe("the pipeline meter", () => {
  test("Q1 of a held hike: credit has not started to travel", () => {
    const first = hike[0];
    const progress = pipelineProgress(first.credit, first.target.credit, BASELINE.credit);

    assert.equal(progress, 0, "nothing has happened yet");
  });

  test("Q8 of a held hike: credit has essentially arrived", () => {
    const last = hike[7];
    const progress = pipelineProgress(last.credit, last.target.credit, BASELINE.credit);

    assert.ok(progress > 0.95, `progress was ${progress}`);
  });

  test("a target equal to baseline reads as arrived, not as a divide by zero", () => {
    assert.equal(pipelineProgress(100, 100, 100), 1);
  });

  test("progress stays between 0 and 1 through a whole run", () => {
    for (const snapshot of hike) {
      for (const name of Object.keys(snapshot.target)) {
        const p = pipelineProgress(snapshot[name], snapshot.target[name], baselineFor(name));
        assert.ok(p >= 0 && p <= 1, `${name} Q${snapshot.quarter} gave ${p}`);
      }
    }
  });
});

describe("baselines for meters", () => {
  test("expectations use the baseline of the variable they price", () => {
    assert.equal(baselineFor("gExp"), BASELINE.growth);
    assert.equal(baselineFor("piExp"), BASELINE.inflation);
    assert.equal(baselineFor("equity"), BASELINE.equity);
  });
});
