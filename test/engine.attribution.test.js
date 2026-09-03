/**
 * Phase 2: targets, contributions and step back.
 *
 * The Simulate screen needs three things the currents alone cannot give it:
 * where a delayed variable is heading, why each variable moved, and a way to
 * go back a quarter. None of these change the eight currents.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  runTape,
  stepBack,
  computeTargets,
  baselineSnapshot,
  CONTRIBUTION_BASE,
  TARGET_VARIABLES,
} from "../src/engine/engine.js";
import { BASELINE } from "../src/engine/coefficients.js";

const config = JSON.parse(
  readFileSync(new URL("./golden/scenarios.json", import.meta.url), "utf8"),
);

const QUARTERS = 8;
const hike = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: QUARTERS });
const oil = runTape([{ quarter: 1, energySupplyGap: 10 }], { quarters: QUARTERS });

const sum = (terms) => Object.values(terms).reduce((a, b) => a + b, 0);
const q = (snapshots, n) => snapshots[n - 1];

describe("contributions add up to the current", () => {
  // Every equation is linear, so the split is exact, not an approximation.
  for (const scenario of config.scenarios) {
    test(scenario.name, () => {
      const snapshots = runTape(scenario.tape, {
        quarters: config.quarters,
        policyMode: scenario.policyMode,
      });

      for (const snapshot of snapshots) {
        for (const [variable, terms] of Object.entries(snapshot.contributions)) {
          const rebuilt = CONTRIBUTION_BASE[variable] + sum(terms);

          assert.ok(
            Math.abs(rebuilt - snapshot[variable]) <= 1e-9,
            `${scenario.id} Q${snapshot.quarter}: ${variable} contributions sum to ` +
              `${rebuilt}, but the snapshot says ${snapshot[variable]}`,
          );
        }
      }
    });
  }
});

describe("no contribution is negative zero", () => {
  // -0 is arithmetically zero but prints as "-0.00", which reads as a move.
  for (const scenario of config.scenarios) {
    test(scenario.name, () => {
      const snapshots = runTape(scenario.tape, {
        quarters: config.quarters,
        policyMode: scenario.policyMode,
      });

      for (const snapshot of snapshots) {
        for (const [variable, terms] of Object.entries(snapshot.contributions)) {
          for (const [id, value] of Object.entries(terms)) {
            assert.ok(
              !Object.is(value, -0),
              `${scenario.id} Q${snapshot.quarter}: ${variable}.${id} is -0`,
            );
          }
        }
      }
    });
  }
});

describe("the contribution set matches the model", () => {
  const expected = {
    treasuryYield: ["r_to_y", "piexp_to_y", "gexp_to_y"],
    dollar: ["r_to_usd", "gexp_to_usd", "supply_to_usd"],
    equity: ["y_to_eq", "gexp_to_eq", "cred_to_eq", "e_to_eq"],
    credit: ["r_to_cred", "g_to_cred", "usd_to_cred"],
    growth: ["cred_to_g", "e_to_g", "eq_to_g"],
    inflation: ["pi_ar", "e_to_pi", "g_to_pi", "usd_to_pi"],
    energy: ["supply_to_e", "g_to_e", "usd_to_e"],
    gExp: ["r_to_gexp", "cred_to_gexp", "supply_to_gexp", "g_to_gexp"],
    piExp: ["pi_to_piexp", "supply_to_piexp", "gexp_to_piexp", "r_to_piexp"],
  };

  test("every variable carries exactly its own links", () => {
    const { contributions } = q(hike, 2);

    assert.deepEqual(Object.keys(contributions).sort(), Object.keys(expected).sort());
    for (const [variable, ids] of Object.entries(expected)) {
      assert.deepEqual(
        Object.keys(contributions[variable]).sort(),
        [...ids].sort(),
        `${variable} has the wrong link set`,
      );
    }
  });

  test("the policy rate has no contributions: it is an input, not an output", () => {
    assert.equal(q(hike, 1).contributions.policyRate, undefined);
  });
});

describe("targets: where a delayed variable is heading", () => {
  test("only the four delayed variables have a target", () => {
    assert.deepEqual(Object.keys(q(hike, 1).target).sort(), [...TARGET_VARIABLES].sort());
  });

  test("Q1 of a held hike: credit is still 100 but its target is already near 96", () => {
    const first = q(hike, 1);

    assert.equal(first.credit, 100, "credit must not move in the hike quarter");
    assert.ok(
      first.target.credit > 95 && first.target.credit < 96.5,
      `target.credit was ${first.target.credit}`,
    );

    // Checked against the spec's own formula, written out with literals rather
    // than the coefficient table, so a wrong table cannot pass twice.
    const bySpec = 100 - 4.0 * (4.5 - 3.5) + 2.5 * 0 - 0.2 * (first.dollar - 100);
    assert.ok(Math.abs(first.target.credit - bySpec) <= 1e-9);
  });

  test("Q1 of a held hike: growth and inflation targets are already below 2", () => {
    const first = q(hike, 1);

    assert.equal(first.growth, 2, "printed growth has not moved");
    assert.ok(first.target.growth < 2, `target.growth was ${first.target.growth}`);
    assert.ok(first.target.inflation < 2, `target.inflation was ${first.target.inflation}`);
  });

  test("Q1 of an oil shock: the inflation target jumps before the print does", () => {
    const first = q(oil, 1);

    assert.equal(first.inflation, 2, "printed inflation has not moved");
    assert.ok(
      first.target.inflation > 2.5,
      `target.inflation was ${first.target.inflation}`,
    );

    // Spec 6.7: a permanent +10 energy gap is worth about +1pp in steady state.
    const bySpec =
      2.0 +
      2 * (0.05 * (first.energy - 100) + 0.25 * 0 - 0.03 * (first.dollar - 100));
    assert.ok(Math.abs(first.target.inflation - bySpec) <= 1e-9);
  });

  test("current converges on target when a shock is held long enough", () => {
    const long = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 40 });
    const last = long[long.length - 1];

    for (const name of TARGET_VARIABLES) {
      assert.ok(
        Math.abs(last[name] - last.target[name]) < 0.05,
        `${name} settled at ${last[name]} but its target is ${last.target[name]}`,
      );
    }
  });

  test("at baseline, every target is its own baseline", () => {
    const targets = computeTargets(BASELINE, 0);
    for (const name of TARGET_VARIABLES) assert.equal(targets[name], BASELINE[name]);
    assert.deepEqual(baselineSnapshot().target, targets);
  });
});

describe("why did equity move?", () => {
  test("Q1 of a held hike: the yield is the dominant negative term", () => {
    const terms = q(hike, 1).contributions.equity;
    const negatives = Object.entries(terms).filter(([, value]) => value < 0);
    const dominant = negatives.sort((a, b) => a[1] - b[1])[0];

    assert.equal(dominant[0], "y_to_eq", "the discount rate should lead");
    assert.ok(terms.y_to_eq < terms.gexp_to_eq, "yield should beat growth expectations");
    assert.equal(terms.cred_to_eq, 0, "credit contributes nothing in the hike quarter");
  });

  test("Q1 of an oil shock: energy is the dominant negative term", () => {
    const terms = q(oil, 1).contributions.equity;
    const negatives = Object.entries(terms).filter(([, value]) => value < 0);
    const dominant = negatives.sort((a, b) => a[1] - b[1])[0];

    assert.equal(dominant[0], "e_to_eq", "the cost shock should lead");
  });

  test("Q1 of a held hike: credit has no contribution at all", () => {
    const terms = q(hike, 1).contributions.credit;

    assert.equal(terms.r_to_cred, 0);
    assert.equal(terms.g_to_cred, 0);
    assert.equal(terms.usd_to_cred, 0);
  });

  test("Q2 of a held hike: the rate is now pulling credit down", () => {
    const terms = q(hike, 2).contributions.credit;

    assert.ok(terms.r_to_cred < 0, `r_to_cred was ${terms.r_to_cred}`);
    // Lag 1, width 2: half the hike has landed by Q2.
    assert.ok(Math.abs(terms.r_to_cred - -4.0 * 0.5) <= 1e-9);
  });
});

describe("step back is replay, not inverse arithmetic", () => {
  const tape = [
    { quarter: 1, policyRate: 4.5 },
    { quarter: 3, energySupplyGap: 8 },
    { quarter: 6, policyRate: 3.0 },
  ];

  test("stepping back from Q5 equals an independent four-quarter run", () => {
    assert.deepEqual(stepBack(tape, 5), runTape(tape, { quarters: 4 }));
  });

  test("stepping back through a whole eight-quarter tape", () => {
    for (let quarter = 8; quarter >= 1; quarter -= 1) {
      assert.deepEqual(
        stepBack(tape, quarter),
        runTape(tape, { quarters: quarter - 1 }),
        `step back from Q${quarter}`,
      );
    }
  });

  test("stepping back from Q1 gives an empty run, not an error", () => {
    assert.deepEqual(stepBack(tape, 1), []);
    assert.deepEqual(stepBack(tape, 0), []);
  });

  test("the policy mode survives the replay", () => {
    const withRule = { policyMode: "taylor" };

    assert.deepEqual(
      stepBack([{ quarter: 1, energySupplyGap: 10 }], 5, withRule),
      runTape([{ quarter: 1, energySupplyGap: 10 }], { quarters: 4, ...withRule }),
    );
  });
});
