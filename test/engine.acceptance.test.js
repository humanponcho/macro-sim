/**
 * The eleven acceptance tests from section 11 of the specification.
 *
 * These are the tests simulateQuarter() must pass before any user interface is
 * built. They check behaviour, not exact numbers: that markets move in the
 * shock quarter while the real economy does not, that credit waits a quarter,
 * that growth and inflation follow later, and that a reversal recovers.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  initialState,
  simulateQuarter,
  runTape,
  baselineSnapshot,
} from "../src/engine/engine.js";
import { BASELINE, VARIABLES } from "../src/engine/coefficients.js";

const QUARTERS = 8;

const hike = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: QUARTERS });
const oil = runTape([{ quarter: 1, energySupplyGap: 10 }], { quarters: QUARTERS });

/** Quarter n, one-based, as the spec numbers them. */
const q = (snapshots, n) => snapshots[n - 1];

describe("T0 baseline", () => {
  test("baseline in, no inputs, baseline out every quarter", () => {
    const snapshots = runTape([], { quarters: QUARTERS });

    for (const snapshot of snapshots) {
      for (const name of VARIABLES) {
        assert.ok(
          Math.abs(snapshot[name] - BASELINE[name]) < 1e-12,
          `Q${snapshot.quarter} ${name} drifted to ${snapshot[name]}`,
        );
      }
    }
  });
});

describe("T1–T5 a held +1pp hike", () => {
  test("T1 Q1: growth and inflation unchanged, markets moved", () => {
    const first = q(hike, 1);

    assert.equal(first.growth.toFixed(2), "2.00");
    assert.equal(first.inflation.toFixed(2), "2.00");

    assert.notEqual(first.treasuryYield, BASELINE.treasuryYield);
    assert.notEqual(first.dollar, BASELINE.dollar);
    assert.notEqual(first.equity, BASELINE.equity);

    // The direction matters as much as the movement.
    assert.ok(first.treasuryYield > BASELINE.treasuryYield, "yield should rise");
    assert.ok(first.dollar > BASELINE.dollar, "dollar should rise");
    assert.ok(first.equity < BASELINE.equity, "equity should fall");
  });

  test("T2 Q1: credit still 100", () => {
    assert.ok(
      Math.abs(q(hike, 1).credit - 100) < 1e-12,
      `credit moved to ${q(hike, 1).credit} in the hike quarter; the lag must be 1`,
    );
  });

  test("T3 Q2: credit below 99", () => {
    assert.ok(q(hike, 2).credit < 99, `credit was ${q(hike, 2).credit}`);
  });

  test("T4 Q4: growth below 1.90", () => {
    assert.ok(q(hike, 4).growth < 1.9, `growth was ${q(hike, 4).growth}`);
  });

  test("T5 Q6: inflation below 1.90", () => {
    assert.ok(q(hike, 6).inflation < 1.9, `inflation was ${q(hike, 6).inflation}`);
  });

  test("growth does not move in Q1 (spec 13: that would be a bug)", () => {
    assert.ok(Math.abs(q(hike, 1).growth - 2.0) < 1e-12);
  });
});

describe("T6 reversal", () => {
  test("back to 3.50 at Q3: recovering by Q6, not still sliding", () => {
    const reversed = runTape(
      [
        { quarter: 1, policyRate: 4.5 },
        { quarter: 3, policyRate: 3.5 },
      ],
      { quarters: QUARTERS },
    );

    assert.ok(
      q(reversed, 6).credit > q(hike, 6).credit,
      `reversed credit ${q(reversed, 6).credit} should beat held ${q(hike, 6).credit}`,
    );
    assert.ok(
      q(reversed, 6).growth > q(hike, 6).growth,
      `reversed growth ${q(reversed, 6).growth} should beat held ${q(hike, 6).growth}`,
    );

    // Recovering means heading back up, not merely less bad.
    assert.ok(
      q(reversed, 6).credit > q(reversed, 4).credit,
      "credit should be rising again by Q6",
    );
  });
});

describe("T7–T9 a held energy supply shock of +10", () => {
  test("T7 Q1: energy above 108, inflation still 2.00", () => {
    assert.ok(q(oil, 1).energy > 108, `energy was ${q(oil, 1).energy}`);
    assert.equal(q(oil, 1).inflation.toFixed(2), "2.00");
  });

  test("T8 Q2: inflation above 2.10", () => {
    assert.ok(q(oil, 2).inflation > 2.1, `inflation was ${q(oil, 2).inflation}`);
  });

  test("T9 Q5: inflation above where growth started, growth below 1.80", () => {
    assert.ok(q(oil, 5).inflation > 2.0, `inflation was ${q(oil, 5).inflation}`);
    assert.ok(q(oil, 5).growth < 1.8, `growth was ${q(oil, 5).growth}`);
  });
});

describe("T10 determinism", () => {
  test("replaying a tape gives identical snapshots", () => {
    const tape = [
      { quarter: 1, policyRate: 4.5 },
      { quarter: 2, energySupplyGap: 6 },
      { quarter: 4, policyRate: 3.0 },
      { quarter: 6, energySupplyGap: 0 },
    ];

    const first = runTape(tape, { quarters: QUARTERS });
    const second = runTape(tape, { quarters: QUARTERS });

    assert.deepEqual(second, first);
  });

  test("simulateQuarter does not modify the state it is given", () => {
    const state = initialState();
    const before = JSON.stringify(state);
    simulateQuarter(state, { policyRate: 4.5 });

    assert.equal(JSON.stringify(state), before);
  });
});

describe("bounds", () => {
  test("an extreme, sustained input never leaves the bounds", () => {
    const snapshots = runTape(
      [{ quarter: 1, policyRate: 12, energySupplyGap: 140 }],
      { quarters: 24 },
    );

    for (const snapshot of snapshots) {
      assert.ok(snapshot.growth >= -4 && snapshot.growth <= 6);
      assert.ok(snapshot.inflation >= -1 && snapshot.inflation <= 15);
      assert.ok(snapshot.energy >= 40 && snapshot.energy <= 250);
      assert.ok(snapshot.equity >= 40 && snapshot.equity <= 180);
      assert.ok(snapshot.credit >= 60 && snapshot.credit <= 140);
      assert.ok(snapshot.dollar >= 70 && snapshot.dollar <= 140);
      assert.ok(snapshot.treasuryYield >= 0.2 && snapshot.treasuryYield <= 15);
      assert.ok(snapshot.policyRate >= 0 && snapshot.policyRate <= 12);
    }
  });
});

describe("expectations lead the prints", () => {
  test("Q1 of the hike prices slower growth before GDP has printed", () => {
    const first = q(hike, 1);

    assert.ok(
      Math.abs(first.gExp - 1.7) < 0.01,
      `expected growth was ${first.gExp}, spec 9 says about 1.70`,
    );
    assert.ok(
      Math.abs(first.piExp - 1.81) < 0.01,
      `expected inflation was ${first.piExp}, spec 9 says about 1.81`,
    );
    assert.equal(first.growth.toFixed(2), "2.00", "printed growth has not moved");
  });
});

describe("the baseline row", () => {
  test("quarter zero reads at baseline", () => {
    const row = baselineSnapshot();

    assert.equal(row.quarter, 0);
    for (const name of VARIABLES) assert.equal(row[name], BASELINE[name]);
  });
});
