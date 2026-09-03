/**
 * Coefficient-drift test.
 *
 * Section 14 of the specification says coefficients must live in one place.
 * The equations in src/engine/coefficients.js are written out readably, so this
 * test proves they still agree with macrosim_model_v1.json link for link.
 *
 * If this fails, one of the two files was edited alone. Fix both.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LINK,
  BASELINE,
  BOUNDS,
  TAYLOR,
} from "../src/engine/coefficients.js";

const model = JSON.parse(
  readFileSync(new URL("../macrosim_model_v1.json", import.meta.url), "utf8"),
);

describe("every link matches macrosim_model_v1.json", () => {
  test("the two files describe the same set of links", () => {
    const inJson = model.links.map((link) => link.id).sort();
    const inCode = Object.keys(LINK).sort();

    assert.deepEqual(inCode, inJson);
  });

  for (const link of model.links) {
    test(`${link.id}: ${link.from} to ${link.to}`, () => {
      const ours = LINK[link.id];
      assert.ok(ours, `${link.id} is missing from coefficients.js`);

      // `b` carries the sign, so the equations read as a sum of contributions.
      const expected = link.sign * link.beta;
      assert.ok(
        Math.abs(ours.b - expected) < 1e-12,
        `beta is ${ours.b}, the model says ${expected}`,
      );
      assert.equal(ours.lag, link.lagQuarters, "lagQuarters differs");
      assert.equal(ours.width, link.width, "width differs");
    });
  }
});

describe("baseline, bounds and the rule match the model", () => {
  test("baseline levels", () => {
    assert.deepEqual(BASELINE, model.baseline);
  });

  test("bounds", () => {
    for (const [name, range] of Object.entries(model.bounds)) {
      assert.deepEqual(BOUNDS[name], range, `${name} bounds differ`);
    }
    assert.deepEqual(Object.keys(BOUNDS).sort(), Object.keys(model.bounds).sort());
  });

  test("Taylor rule parameters", () => {
    const rule = model.taylorRule;

    assert.equal(TAYLOR.rStar, rule.rStar);
    assert.equal(TAYLOR.piStar, rule.piStar);
    assert.equal(TAYLOR.gStar, rule.gStar);
    assert.equal(TAYLOR.weightInflation, rule.weightInflation);
    assert.equal(TAYLOR.weightGrowth, rule.weightGrowth);
    assert.equal(TAYLOR.maxStepPerQuarter, rule.maxStepPerQuarter);
  });

  test("the rule is off by default", () => {
    assert.equal(model.taylorRule.enabledDefault, false);
  });
});

describe("no link outside the master table exists", () => {
  test("spec 7: if a link is not in the table, it does not exist in v1", () => {
    assert.equal(
      Object.keys(LINK).length,
      model.links.length,
      "the code defines a different number of links from the model",
    );
  });
});
