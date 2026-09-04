/**
 * Tape editing.
 *
 * The tape is the only state the screen keeps, so a bug here is a bug in every
 * panel at once. The regression that prompted these tests: loading a shock card
 * and pressing Advance used to write the slider's value over the card's own
 * entry, so the class ran a different experiment from the one on the card.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runTape } from "../src/engine/engine.js";
import {
  stageEntry,
  withEntry,
  truncate,
  effectiveInputs,
  tapeLength,
} from "../src/ui/tape.js";

const experiments = JSON.parse(
  readFileSync(new URL("../content/experiments.json", import.meta.url), "utf8"),
).experiments;

const BASE_RATE = 3.5;

describe("effective inputs read the tape, not the controls", () => {
  test("before the first quarter, everything is at baseline", () => {
    assert.deepEqual(effectiveInputs([], 0), { policyRate: BASE_RATE, energySupplyGap: 0 });
  });

  test("a held entry keeps applying in later quarters", () => {
    const tape = [{ quarter: 1, policyRate: 4.5 }];

    assert.equal(effectiveInputs(tape, 1).policyRate, 4.5);
    assert.equal(effectiveInputs(tape, 4).policyRate, 4.5);
  });

  test("a later entry supersedes an earlier one", () => {
    const tape = [
      { quarter: 1, policyRate: 4.5 },
      { quarter: 3, policyRate: 3.5 },
    ];

    assert.equal(effectiveInputs(tape, 2).policyRate, 4.5);
    assert.equal(effectiveInputs(tape, 3).policyRate, 3.5);
  });
});

describe("staging only records what actually changed", () => {
  test("an untouched control writes nothing", () => {
    const entry = stageEntry({
      tape: [],
      quarter: 0,
      policyRate: BASE_RATE,
      energySupplyGap: 0,
      policyMode: "manual",
    });

    assert.equal(entry, null, "an unchanged input must not reach the tape");
  });

  test("a moved control writes one entry for the next quarter", () => {
    const entry = stageEntry({
      tape: [],
      quarter: 0,
      policyRate: 4.5,
      energySupplyGap: 0,
      policyMode: "manual",
    });

    assert.deepEqual(entry, { quarter: 1, policyRate: 4.5 });
  });

  test("holding a rate that is already set writes nothing further", () => {
    const tape = [{ quarter: 1, policyRate: 4.5 }];
    const entry = stageEntry({
      tape,
      quarter: 1,
      policyRate: 4.5,
      energySupplyGap: 0,
      policyMode: "manual",
    });

    assert.equal(entry, null, "holding is the absence of an entry, not a repeat of one");
  });

  test("both inputs can change in the same quarter", () => {
    const entry = stageEntry({
      tape: [],
      quarter: 2,
      policyRate: 5,
      energySupplyGap: 10,
      policyMode: "manual",
    });

    assert.deepEqual(entry, { quarter: 3, policyRate: 5, energySupplyGap: 10 });
  });
});

describe("editing the tape", () => {
  test("an entry replaces any other for the same quarter", () => {
    const tape = withEntry([{ quarter: 1, policyRate: 4.5 }], { quarter: 1, policyRate: 5 });

    assert.equal(tape.length, 1);
    assert.equal(tape[0].policyRate, 5);
  });

  test("entries stay in quarter order however they arrive", () => {
    let tape = [];
    for (const quarter of [3, 1, 2]) tape = withEntry(tape, { quarter, policyRate: quarter });

    assert.deepEqual(tape.map((e) => e.quarter), [1, 2, 3]);
  });

  test("truncating drops the future and keeps the past", () => {
    const tape = [
      { quarter: 1, policyRate: 4.5 },
      { quarter: 3, policyRate: 3.5 },
      { quarter: 5, policyRate: 5 },
    ];

    assert.deepEqual(truncate(tape, 3).map((e) => e.quarter), [1, 3]);
    assert.deepEqual(truncate(tape, 0), []);
  });

  test("tapeLength reports the furthest quarter the tape touches", () => {
    assert.equal(tapeLength([]), 0);
    assert.equal(tapeLength([{ quarter: 1 }, { quarter: 6 }, { quarter: 3 }]), 6);
  });
});

describe("playing a card does not rewrite it", () => {
  // The regression. Advancing through a card must reproduce the card exactly.
  for (const card of experiments) {
    test(`${card.id} survives being advanced one quarter at a time`, () => {
      let tape = card.tape.map((entry) => ({ ...entry }));

      // While a card plays, the controls follow the tape and stage nothing.
      for (let quarter = 0; quarter < card.quarters; quarter += 1) {
        const now = effectiveInputs(tape, quarter, card.policyMode);
        const entry = stageEntry({
          tape,
          quarter,
          policyRate: now.policyRate,
          energySupplyGap: now.energySupplyGap,
          policyMode: card.policyMode,
        });

        assert.equal(
          entry,
          null,
          `${card.id} Q${quarter + 1}: following the tape must not stage an entry`,
        );
      }

      assert.deepEqual(tape, card.tape, "the tape is unchanged");
      assert.deepEqual(
        runTape(tape, { quarters: card.quarters, policyMode: card.policyMode }),
        runTape(card.tape, { quarters: card.quarters, policyMode: card.policyMode }),
      );
    });
  }

  test("taking the wheel mid-card keeps the past and drops the rest", () => {
    const card = experiments.find((c) => c.id === "hike_reversed");
    const atQuarter = 2;

    const taken = truncate(card.tape, atQuarter);
    assert.deepEqual(taken, [{ quarter: 1, policyRate: 4.5 }]);

    // The first two quarters still match the card exactly.
    const own = runTape(taken, { quarters: atQuarter, policyMode: "manual" });
    const original = runTape(card.tape, { quarters: atQuarter, policyMode: "manual" });
    assert.deepEqual(own, original);

    // And the reversal the student did not reach is gone.
    assert.equal(effectiveInputs(taken, 6).policyRate, 4.5);
    assert.equal(effectiveInputs(card.tape, 6).policyRate, 3.5);
  });
});

describe("driving by hand", () => {
  test("a hand-driven run reproduces the held-hike card exactly", () => {
    let tape = [];
    let quarter = 0;
    let policyRate = BASE_RATE;

    // Quarter 1: raise the rate. Quarters 2 to 8: leave it alone.
    for (let step = 0; step < 8; step += 1) {
      if (step === 0) policyRate = 4.5;
      tape = withEntry(
        tape,
        stageEntry({ tape, quarter, policyRate, energySupplyGap: 0, policyMode: "manual" }),
      );
      quarter += 1;
    }

    assert.deepEqual(tape, [{ quarter: 1, policyRate: 4.5 }], "holding adds no entries");

    const card = experiments.find((c) => c.id === "hike_held");
    assert.deepEqual(
      runTape(tape, { quarters: 8, policyMode: "manual" }),
      runTape(card.tape, { quarters: 8, policyMode: "manual" }),
    );
  });

  test("stepping back then forward again lands where it started", () => {
    const tape = [{ quarter: 1, policyRate: 4.5 }];
    const before = runTape(tape, { quarters: 5, policyMode: "manual" });

    const rewound = truncate(tape, 3);
    const now = effectiveInputs(rewound, 3, "manual");
    let replayed = rewound;
    for (let quarter = 3; quarter < 5; quarter += 1) {
      replayed = withEntry(
        replayed,
        stageEntry({ tape: replayed, quarter, ...now, policyMode: "manual" }),
      );
    }

    assert.deepEqual(runTape(replayed, { quarters: 5, policyMode: "manual" }), before);
  });
});
