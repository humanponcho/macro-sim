/**
 * Golden-file tests: the JavaScript port against the Python oracle.
 *
 * tools/generate_golden.py drives macrosim_engine_v1.py with the tapes in
 * golden/scenarios.json and writes one CSV per scenario. This file replays the
 * same tapes through the port and compares every number.
 *
 * The tolerance here (1e-9) is far tighter than the spec's acceptance
 * tolerance, on purpose: both engines do the same arithmetic in the same order,
 * so anything beyond floating-point noise means the port has drifted.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runTape } from "../src/engine/engine.js";

const TOLERANCE = 1e-9;

const config = JSON.parse(
  readFileSync(new URL("./golden/scenarios.json", import.meta.url), "utf8"),
);

function readGolden(id) {
  const text = readFileSync(
    new URL(`./golden/${id}.csv`, import.meta.url),
    "utf8",
  ).trim();
  const [header, ...lines] = text.split(/\r?\n/);
  const columns = header.split(",").map((name) => name.trim());

  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    columns.forEach((column, i) => {
      row[column] = Number(cells[i].trim());
    });
    return row;
  });
}

/** Visit every number in a snapshot, including target and contributions. */
function walkNumbers(node, visit, path = "") {
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;
    if (value === null || typeof value === "string") continue;
    if (typeof value === "object") {
      walkNumbers(value, visit, here);
    } else {
      visit(here, value);
    }
  }
}

describe("JavaScript port matches the Python oracle", () => {
  for (const scenario of config.scenarios) {
    test(scenario.name, () => {
      const expected = readGolden(scenario.id);
      const actual = runTape(scenario.tape, {
        quarters: config.quarters,
        policyMode: scenario.policyMode,
      });

      assert.equal(
        actual.length,
        expected.length,
        `expected ${expected.length} quarters, got ${actual.length}`,
      );

      expected.forEach((expectedRow, index) => {
        const actualRow = actual[index];

        for (const [column, want] of Object.entries(expectedRow)) {
          const got = actualRow[column];
          assert.equal(
            typeof got,
            "number",
            `${scenario.id} Q${expectedRow.quarter}: ${column} is missing from the snapshot`,
          );
          assert.ok(
            Math.abs(got - want) <= TOLERANCE,
            `${scenario.id} Q${expectedRow.quarter}: ${column} was ${got}, oracle says ${want}`,
          );
        }
      });
    });
  }
});

describe("no NaN reaches a snapshot", () => {
  // In Python a mistyped state key raises KeyError and stops. In JavaScript it
  // returns undefined, and the resulting NaN spreads silently through every
  // later quarter. This is the guard that replaces the type checker.
  for (const scenario of config.scenarios) {
    test(scenario.name, () => {
      const snapshots = runTape(scenario.tape, {
        quarters: config.quarters,
        policyMode: scenario.policyMode,
      });

      for (const snapshot of snapshots) {
        walkNumbers(snapshot, (path, value) => {
          assert.ok(
            Number.isFinite(value),
            `${scenario.id} Q${snapshot.quarter}: ${path} is ${value}`,
          );
        });
      }
    });
  }
});

describe("the two published tables in the spec", () => {
  // Spec sections 9 and 10 print these rounded. A reader should be able to
  // check the app against the document by eye.
  const published = {
    hike_held: [
      // Q, policy, yield, dollar, equity, credit, growth, inflation, energy
      [1, 4.5, 4.36, 102.1, 94.4, 100.0, 2.0, 2.0, 99.3],
      [2, 4.5, 4.36, 102.1, 94.1, 97.8, 1.98, 1.98, 99.3],
      [3, 4.5, 4.33, 102.0, 93.1, 95.6, 1.91, 1.93, 99.3],
      [4, 4.5, 4.28, 101.8, 92.3, 95.5, 1.78, 1.89, 99.1],
      [5, 4.5, 4.26, 101.8, 91.9, 95.2, 1.66, 1.84, 98.8],
      [6, 4.5, 4.23, 101.7, 91.7, 95.0, 1.6, 1.8, 98.3],
    ],
    oil_held: [
      [1, 3.5, 3.9, 100.7, 95.3, 100.0, 2.0, 2.0, 109.8],
      [2, 3.5, 3.9, 100.7, 95.3, 99.9, 1.86, 2.24, 109.8],
      [3, 3.5, 3.92, 100.6, 94.6, 99.7, 1.72, 2.6, 109.5],
      [4, 3.5, 3.97, 100.5, 93.8, 99.4, 1.58, 2.77, 109.0],
      [5, 3.5, 3.98, 100.4, 93.2, 99.0, 1.56, 2.82, 108.5],
      [6, 3.5, 3.98, 100.4, 93.0, 98.8, 1.55, 2.79, 108.1],
    ],
  };

  // Spec 11: tolerance is 0.05 on percentage variables, 0.4 on index variables.
  const fields = [
    ["policyRate", 0.05],
    ["treasuryYield", 0.05],
    ["dollar", 0.4],
    ["equity", 0.4],
    ["credit", 0.4],
    ["growth", 0.05],
    ["inflation", 0.05],
    ["energy", 0.4],
  ];

  for (const [id, rows] of Object.entries(published)) {
    test(id, () => {
      const scenario = config.scenarios.find((s) => s.id === id);
      const snapshots = runTape(scenario.tape, {
        quarters: config.quarters,
        policyMode: scenario.policyMode,
      });

      for (const row of rows) {
        const [quarter, ...values] = row;
        const snapshot = snapshots[quarter - 1];

        fields.forEach(([field, tolerance], i) => {
          assert.ok(
            Math.abs(snapshot[field] - values[i]) <= tolerance,
            `Q${quarter} ${field}: engine says ${snapshot[field]}, spec table says ${values[i]}`,
          );
        });
      }
    });
  }
});
