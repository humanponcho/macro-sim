/**
 * The layer map.
 *
 * The map is a legend, not a second engine. These tests hold it to two
 * promises: every id it claims resolves to something the engine really has,
 * and selecting a layer never changes an input.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runTape } from "../src/engine/engine.js";
import { LINK } from "../src/engine/coefficients.js";
import {
  buildMap,
  buildLayerPanel,
  layerActivity,
  layerRefs,
  resolveRef,
  validateLayerRefs,
  explainableIn,
  omissionSentence,
  ENGINE_INPUTS,
} from "../src/ui/map.js";
import { stageEntry, effectiveInputs } from "../src/ui/tape.js";
import { formatValue } from "../src/display/format.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../content/${name}`, import.meta.url), "utf8"));

const content = {
  variables: load("variables.json").variables,
  links: load("links.json").links,
  layers: load("layers.json").layers,
  experiments: load("experiments.json").experiments,
  copy: load("copy.json"),
};

const hike = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 12 });
const layerOf = (n) => content.layers.find((l) => l.number === n);
const tileOf = (map, n) => map.find((t) => t.number === n);

describe("every engine id the map claims resolves", () => {
  test("the mapping has no unknown ids and no contradictions", () => {
    assert.deepEqual(validateLayerRefs(content.layers, content), []);
  });

  test("ids resolve to a variable, a link or an input", () => {
    for (const layer of content.layers) {
      for (const ref of layerRefs(layer)) {
        const resolved = resolveRef(ref, content);
        assert.ok(resolved, `L${layer.number} claims "${ref}"`);
        assert.ok(["variable", "link", "input"].includes(resolved.kind));
      }
    }
  });

  test("an unknown id is caught rather than rendered blank", () => {
    const broken = [{ ...layerOf(6), engineVariables: ["creditt"] }];
    const problems = validateLayerRefs(broken, content);

    assert.equal(problems.length, 1);
    assert.match(problems[0], /unknown engine id "creditt"/);
  });

  test("link ids are accepted, so a channel can be a layer's story", () => {
    assert.deepEqual(resolveRef("eq_to_g", content), { kind: "link", id: "eq_to_g" });
    assert.ok(LINK.eq_to_g, "eq_to_g must exist in the model for that to be true");
  });

  test("the energy supply shock resolves as an input, not a readout", () => {
    assert.deepEqual(resolveRef("energySupplyGap", content), {
      kind: "input",
      id: "energySupplyGap",
    });
    assert.deepEqual(ENGINE_INPUTS, ["energySupplyGap"]);
  });
});

describe("spoken layers hold no engine controls", () => {
  test("a discussed layer claims nothing and is not selectable", () => {
    const map = buildMap(content, hike[0], null);

    for (const tile of map) {
      if (tile.mode !== "discussed") continue;
      assert.equal(tile.refs.length, 0, `L${tile.number} is spoken but claims ids`);
      assert.equal(tile.selectable, false, `L${tile.number} is spoken but selectable`);
      assert.equal(tile.explainable.length, 0);
    }
  });

  test("a spoken layer that claimed a variable is a caught error", () => {
    const broken = [{ ...layerOf(1), engineVariables: ["growth"] }];
    assert.match(validateLayerRefs(broken, content)[0], /spoken but claims/);
  });

  test("every layer that leaves something out says so, simulated or not", () => {
    const map = buildMap(content, hike[0], null);

    for (const tile of map) {
      if (tile.notSimulated.length === 0) continue;
      assert.ok(tile.omission, `L${tile.number} has no sentence to show`);
      assert.match(tile.omission, /Not simulated here:/);
    }
  });

  test("a simulated layer still owes the class its omissions", () => {
    // Layer 9 is simulated, and property and gold are still not in the model.
    const assets = buildMap(content, hike[0], null).find((t) => t.number === 9);

    assert.equal(assets.mode, "simulated");
    assert.match(assets.omission, /property/i);
    assert.match(assets.omission, /gold/i);
  });

  test("a partial layer names what it cannot show", () => {
    const map = buildMap(content, hike[0], null);
    const trade = map.find((t) => t.number === 4);
    const labour = map.find((t) => t.number === 5);

    assert.match(trade.omission, /tariffs/i);
    assert.match(labour.omission, /employment|wages/i);
  });

  test("the omission sentence reads as a sentence, not a list dump", () => {
    const one = omissionSentence({ notSimulated: ["gold"] }, content);
    const three = omissionSentence({ notSimulated: ["a", "b", "c"] }, content);

    assert.match(one, /Not simulated here: gold\.$/);
    assert.match(three, /a, b and c\.$/);
  });
});

describe("the three activity states", () => {
  test("Q1 of a hike: layer 6 is in flight precisely because it did not move", () => {
    const map = buildMap(content, hike[0], null);
    const credit = tileOf(map, 6);

    assert.equal(credit.activity, "inFlight");
  });

  test("Q2 of a hike: layer 6 has moved", () => {
    const map = buildMap(content, hike[1], hike[0]);

    assert.equal(tileOf(map, 6).activity, "moving");
  });

  test("Q1 of a hike: layer 8 moved, because markets price the same quarter", () => {
    const map = buildMap(content, hike[0], null);

    assert.equal(tileOf(map, 8).activity, "moving");
  });

  test("in flight is false once current and target print the same", () => {
    // Credit converges on its target at Q9.
    const settled = layerActivity(layerOf(6), hike[8], hike[7], content);
    assert.notEqual(settled, "inFlight", "the meter and the map must agree");
  });

  test("a baseline run leaves every layer quiet", () => {
    const flat = runTape([], { quarters: 3 });
    const map = buildMap(content, flat[2], flat[1]);

    for (const tile of map) assert.equal(tile.activity, "quiet", `L${tile.number}`);
  });

  test("a spoken layer is always quiet, whatever the economy does", () => {
    for (let q = 1; q <= 8; q += 1) {
      const map = buildMap(content, hike[q - 1], hike[q - 2] ?? null);
      for (const tile of map) {
        if (tile.mode === "discussed") assert.equal(tile.activity, "quiet");
      }
    }
  });

  test("every tile carries exactly one of the three states", () => {
    for (let q = 1; q <= 8; q += 1) {
      const map = buildMap(content, hike[q - 1], hike[q - 2] ?? null);
      for (const tile of map) {
        assert.ok(["quiet", "moving", "inFlight"].includes(tile.activity));
      }
    }
  });
});

describe("the map agrees with the printed digits", () => {
  test("no tile claims in flight when every printed pair is equal", () => {
    // The pipeline meter and the map must never contradict each other, and
    // neither may claim a move the reader cannot see on screen.
    const delayed = ["credit", "growth", "inflation", "energy"];

    for (const card of content.experiments) {
      const path = runTape(card.tape, {
        quarters: card.quarters,
        policyMode: card.policyMode,
      });

      for (let i = 0; i < path.length; i += 1) {
        const snapshot = path[i];

        for (const tile of buildMap(content, snapshot, path[i - 1] ?? null)) {
          if (tile.activity !== "inFlight") continue;

          const travelling = tile.variables
            .filter((id) => delayed.includes(id))
            .some(
              (id) =>
                formatValue(id, snapshot[id]) !== formatValue(id, snapshot.target[id]),
            );

          assert.ok(
            travelling,
            `${card.id} Q${i + 1} L${tile.number} claims in flight with nothing to travel`,
          );
        }
      }
    }
  });

  test("layer 6 in flight tracks the printed credit digits exactly", () => {
    for (let i = 0; i < hike.length; i += 1) {
      const snapshot = hike[i];
      const tile = buildMap(content, snapshot, hike[i - 1] ?? null).find((t) => t.number === 6);
      const differ =
        formatValue("credit", snapshot.credit) !==
        formatValue("credit", snapshot.target.credit);

      if (!differ) {
        assert.notEqual(tile.activity, "inFlight", `Q${i + 1}: 100.0 heading for 100.0`);
      }
    }
  });
});

describe("selecting a layer changes nothing", () => {
  test("a simulated layer opens attribution for its own variables", () => {
    const panel = buildLayerPanel(content, 9, hike[0]);

    assert.ok(panel.explainable.includes("equity"));
    for (const id of panel.explainable) assert.ok(hike[0].contributions[id]);
  });

  test("layer 7 can be read but not explained: the rate is an input", () => {
    const map = buildMap(content, hike[0], null);
    const panel = buildLayerPanel(content, 7, hike[0]);

    assert.deepEqual(explainableIn(layerOf(7), hike[0]), []);
    assert.equal(tileOf(map, 7).selectable, false);
    assert.deepEqual(panel.explainable, []);
    assert.equal(panel.variableLabels[0].id, "policyRate");
    assert.equal(panel.variableLabels[0].explainable, false);
  });

  test("clicking layer 7 does not move the rate", () => {
    // Selecting is a read. The tape is the only thing that can change an input,
    // and nothing in the map module touches it.
    const tape = [{ quarter: 1, policyRate: 4.5 }];
    const before = JSON.stringify(tape);

    buildMap(content, hike[2], hike[1], 7);
    buildLayerPanel(content, 7, hike[2]);

    assert.equal(JSON.stringify(tape), before);
    assert.equal(effectiveInputs(tape, 3).policyRate, 4.5);
  });

  test("selection is carried as a flag, on one tile at most", () => {
    const map = buildMap(content, hike[0], null, 6);
    assert.deepEqual(map.filter((t) => t.selected).map((t) => t.number), [6]);
  });
});

describe("the cards", () => {
  test("playing the rate-hike card and advancing keeps the rate at 4.50", () => {
    const card = content.experiments.find((c) => c.id === "hike_held");
    const tape = card.tape.map((entry) => ({ ...entry }));

    // Following the tape stages nothing, so the card is not rewritten.
    const entry = stageEntry({
      tape,
      quarter: 0,
      ...effectiveInputs(tape, 0, card.policyMode),
      policyMode: card.policyMode,
    });

    assert.equal(entry, null);
    assert.equal(effectiveInputs(tape, 1, card.policyMode).policyRate, 4.5);
    assert.equal(runTape(tape, { quarters: 1, policyMode: card.policyMode })[0].policyRate, 4.5);
  });

  test("every card's prediction ids are real readouts", () => {
    for (const card of content.experiments) {
      assert.ok(card.predictPrompt, `${card.id} has no prompt`);
      assert.ok(card.predict.length >= 3, `${card.id} has too few predictions`);

      for (const item of card.predict) {
        assert.ok(
          content.variables[item.variable],
          `${card.id} predicts unknown "${item.variable}"`,
        );
        assert.ok(["moves", "still"].includes(item.answer), `${card.id} bad answer`);
        assert.ok(item.because, `${card.id}: ${item.variable} has no reason`);
      }
    }
  });

  test("each prediction is true of the run the card actually produces", () => {
    for (const card of content.experiments) {
      const path = runTape(card.tape, {
        quarters: card.quarters,
        policyMode: card.policyMode,
      });
      const first = path[0];

      for (const item of card.predict) {
        if (item.answer !== "still") continue;
        // "still" is a claim about the shock quarter, and it must be true.
        const baseline = content.variables[item.variable].baseline;
        assert.ok(
          Math.abs(first[item.variable] - baseline) < 1e-9,
          `${card.id}: ${item.variable} was predicted still but read ${first[item.variable]}`,
        );
      }
    }
  });

  test("teacher lines only point at quarters the card reaches", () => {
    for (const card of content.experiments) {
      for (const cue of card.watchFor) {
        assert.ok(cue.quarter >= 1 && cue.quarter <= card.quarters, card.id);
      }
    }
  });
});

describe("no tile is ever blank", () => {
  test("all ten tiles carry a title, a badge and an activity", () => {
    for (let q = 0; q <= 8; q += 1) {
      const map = buildMap(content, q ? hike[q - 1] : null, q > 1 ? hike[q - 2] : null);

      assert.equal(map.length, 10);
      for (const tile of map) {
        assert.ok(tile.title, `L${tile.number} has no title`);
        assert.ok(tile.badge, `L${tile.number} has no badge`);
        assert.ok(tile.plain, `L${tile.number} has no plain line`);
        assert.ok(tile.activity, `L${tile.number} has no activity`);
        assert.ok(!String(tile.badge).includes("undefined"));
      }
    }
  });

  test("a panel exists for every layer, selectable or not", () => {
    for (const layer of content.layers) {
      const panel = buildLayerPanel(content, layer.number, hike[0]);
      assert.ok(panel, `L${layer.number} has no panel`);
      assert.ok(panel.title && panel.plain);
    }
  });
});
