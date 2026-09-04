/**
 * Content contract.
 *
 * The lesson copy lives in content/ and is keyed to engine ids. This suite is
 * what stops the two drifting apart: a renamed link id, a variable that lost
 * its label, or a teacher line quoting a number the model no longer produces
 * all fail here rather than rendering a blank or a lie on screen.
 *
 * The expect blocks in experiments.json are checked against the live engine, so
 * every figure a teacher reads aloud is one the model actually prints.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { runTape } from "../src/engine/engine.js";
import { LINK, BASELINE, VARIABLES } from "../src/engine/coefficients.js";
import { UNIT } from "../src/display/format.js";

const READOUTS = [...VARIABLES, "gExp", "piExp"];
const BASELINE_FOR = { ...BASELINE, gExp: BASELINE.growth, piExp: BASELINE.inflation };

/** Quoted figures are rounded to three decimals. */
const QUOTE_TOLERANCE = 0.001;

function read(name) {
  const url = new URL(`../content/${name}`, import.meta.url);
  if (!existsSync(url)) throw new Error(`content/${name} is missing`);
  const text = readFileSync(url, "utf8");
  return name.endsWith(".json") ? JSON.parse(text) : text;
}

/**
 * Ids out of a collection, whether it is an object keyed by id or an array of
 * records carrying one. The content may use either shape.
 */
function idsOf(node) {
  if (Array.isArray(node)) {
    return node.map((entry, i) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry.id === "string") return entry.id;
      throw new Error(`entry ${i} has no id`);
    });
  }
  if (node && typeof node === "object") {
    return Object.keys(node).filter((key) => !key.startsWith("_"));
  }
  throw new Error("expected an object or an array");
}

/** Unwrap { links: {...} } or take the document as the collection itself. */
function collection(doc, ...keys) {
  for (const key of keys) {
    if (doc && typeof doc === "object" && doc[key] !== undefined) return doc[key];
  }
  return doc;
}

describe("the bundle is complete", () => {
  const files = [
    "variables.json",
    "links.json",
    "layers.json",
    "experiments.json",
    "glossary.json",
    "copy.json",
    "reconciliation.md",
  ];

  for (const name of files) {
    test(name, () => {
      const doc = read(name);
      assert.ok(doc, `${name} is empty`);
    });
  }
});

describe("variables.json covers every readout", () => {
  const variables = collection(read("variables.json"), "variables");
  const ids = idsOf(variables);

  test("exactly the ten readouts, no more and no fewer", () => {
    assert.deepEqual([...ids].sort(), [...READOUTS].sort());
  });

  test("units agree with the display module", () => {
    for (const id of ids) {
      assert.equal(
        variables[id].unit,
        UNIT[id],
        `${id} is "${variables[id].unit}" in content but "${UNIT[id]}" in format.js`,
      );
    }
  });

  test("baselines agree with the model", () => {
    for (const id of ids) {
      if (variables[id].baseline === undefined) continue;
      assert.equal(variables[id].baseline, BASELINE_FOR[id], `${id} baseline differs`);
    }
  });

  test("every readout has a label and a plain-English line", () => {
    for (const id of ids) {
      assert.ok(variables[id].label, `${id} has no label`);
      assert.ok(variables[id].plain, `${id} has no plain line`);
    }
  });
});

describe("links.json covers every link the engine can use", () => {
  const links = collection(read("links.json"), "links");
  const ids = idsOf(links);

  test("exactly the 31 links in the model, no more and no fewer", () => {
    assert.deepEqual([...ids].sort(), Object.keys(LINK).sort());
  });

  test("every link has a bar label and an explanation", () => {
    for (const id of ids) {
      assert.ok(links[id].label, `${id} has no label`);
      assert.ok(links[id].plain, `${id} has no explanation`);
    }
  });

  test("every link that appears in a contribution set has a label", () => {
    const snapshot = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 1 })[0];

    for (const terms of Object.values(snapshot.contributions)) {
      for (const id of Object.keys(terms)) {
        assert.ok(links[id], `${id} appears on screen with no label`);
      }
    }
  });
});

describe("layers.json places every engine variable exactly once", () => {
  const layers = collection(read("layers.json"), "layers");

  test("ten layers, numbered 1 to 10", () => {
    assert.equal(layers.length, 10);
    assert.deepEqual(
      layers.map((l) => l.number),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  });

  test("every readout has exactly one home", () => {
    const placed = layers.flatMap((layer) => layer.engineVariables ?? []);

    assert.deepEqual([...placed].sort(), [...READOUTS].sort());
    assert.equal(new Set(placed).size, placed.length, "a variable is placed twice");
  });

  test("only real engine variables are claimed", () => {
    for (const layer of layers) {
      for (const id of layer.engineVariables ?? []) {
        assert.ok(READOUTS.includes(id), `layer ${layer.number} claims unknown "${id}"`);
      }
    }
  });

  test("a layer's mode matches what it actually simulates", () => {
    for (const layer of layers) {
      const count = (layer.engineVariables ?? []).length;
      assert.ok(
        ["simulated", "partial", "discussed"].includes(layer.mode),
        `layer ${layer.number} has mode "${layer.mode}"`,
      );
      if (layer.mode === "discussed") {
        assert.equal(count, 0, `layer ${layer.number} is discussed but claims variables`);
      }
    }
  });

  test("a layer that leaves something out says so", () => {
    // Spec 12 rules things out on purpose. The map must admit it.
    for (const layer of layers) {
      if (layer.mode === "simulated") continue;
      assert.ok(
        (layer.notSimulated ?? []).length > 0,
        `layer ${layer.number} is not fully simulated but lists nothing it omits`,
      );
    }
  });
});

describe("experiments.json runs, and its figures are the engine's", () => {
  const experiments = collection(read("experiments.json"), "experiments");

  test("four cards with distinct ids", () => {
    const ids = experiments.map((card) => card.id);
    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4);
  });

  for (const card of experiments) {
    test(`${card.id}: the tape runs`, () => {
      assert.ok(["manual", "taylor"].includes(card.policyMode));

      const snapshots = runTape(card.tape, {
        quarters: card.quarters,
        policyMode: card.policyMode,
      });

      assert.equal(snapshots.length, card.quarters);
      for (const entry of card.tape) {
        assert.ok(entry.quarter >= 1 && entry.quarter <= card.quarters);
      }
    });

    test(`${card.id}: every quoted figure matches the model`, () => {
      const snapshots = runTape(card.tape, {
        quarters: card.quarters,
        policyMode: card.policyMode,
      });

      let checked = 0;

      for (const block of card.expect ?? []) {
        const snapshot = snapshots[block.quarter - 1];
        assert.ok(snapshot, `${card.id} quotes Q${block.quarter}, which it never reaches`);

        const compare = (label, got, want) => {
          assert.ok(
            Math.abs(got - want) <= QUOTE_TOLERANCE,
            `${card.id} Q${block.quarter} ${label}: card says ${want}, engine says ${got}`,
          );
          checked += 1;
        };

        for (const [name, want] of Object.entries(block.values ?? {})) {
          assert.ok(READOUTS.includes(name), `${card.id} quotes unknown variable "${name}"`);
          compare(name, snapshot[name], want);
        }

        for (const [name, want] of Object.entries(block.target ?? {})) {
          assert.ok(
            snapshot.target[name] !== undefined,
            `${card.id} quotes a target for "${name}", which has none`,
          );
          compare(`target.${name}`, snapshot.target[name], want);
        }

        for (const [variable, terms] of Object.entries(block.contributions ?? {})) {
          const actual = snapshot.contributions[variable];
          assert.ok(actual, `${card.id} quotes contributions for unknown "${variable}"`);

          for (const [id, want] of Object.entries(terms)) {
            assert.ok(actual[id] !== undefined, `${variable} has no link "${id}"`);
            compare(`${variable}.${id}`, actual[id], want);
          }
        }
      }

      assert.ok(checked > 0, `${card.id} quotes no figures, so nothing is protected`);
    });

    test(`${card.id}: has a teacher line and something to watch for`, () => {
      assert.ok(card.title, "no title");
      assert.ok(card.teacherLine, "no teacher line");
      assert.ok((card.watchFor ?? []).length > 0, "nothing to watch for");

      for (const cue of card.watchFor) {
        assert.ok(
          cue.quarter >= 1 && cue.quarter <= card.quarters,
          `a cue points at Q${cue.quarter}, outside the run`,
        );
        assert.ok(cue.say, "a cue has no line to say");
      }
    });
  }
});

describe("glossary.json and copy.json line up with the engine", () => {
  const glossary = collection(read("glossary.json"), "glossary");
  const copy = read("copy.json");

  test("a glossary entry that claims a variable claims a real one", () => {
    for (const [key, entry] of Object.entries(glossary)) {
      if (key.startsWith("_") || !entry.variable) continue;
      assert.ok(READOUTS.includes(entry.variable), `${key} points at "${entry.variable}"`);
    }
  });

  test("cross-references resolve", () => {
    for (const [key, entry] of Object.entries(glossary)) {
      if (key.startsWith("_")) continue;
      for (const other of entry.seeAlso ?? []) {
        assert.ok(glossary[other], `${key} points at missing entry "${other}"`);
      }
    }
  });

  test("the policy-rate control matches the model's own bounds", () => {
    const control = copy.controls.policyRate;

    assert.equal(control.min, 0);
    assert.equal(control.max, 12);
    assert.equal(control.baseline, BASELINE.policyRate);
  });

  test("both policy modes have a label", () => {
    assert.ok(copy.controls.policyMode.options.manual);
    assert.ok(copy.controls.policyMode.options.taylor);
  });

  test("the banners the screen depends on exist", () => {
    for (const key of ["shockQuarter", "baseline", "offScaleTarget", "ruleActive"]) {
      assert.ok(copy.banners[key], `banners.${key} is missing`);
    }
  });
});

describe("reconciliation.md maps the beginner chain onto the ten layers", () => {
  const text = read("reconciliation.md");

  test("every layer from L1 to L10 is named", () => {
    for (let n = 1; n <= 10; n += 1) {
      assert.ok(text.includes(`L${n}`), `L${n} is never mentioned`);
    }
  });

  test("it says plainly what has no layer at all", () => {
    assert.match(text, /fiscal policy/i);
  });
});
