/**
 * The view model.
 *
 * These run without a browser, because the view model is pure: it turns a
 * snapshot plus the content bundle into rows, and src/ui/render.js only walks
 * them. Anything the screen decides is decided here, so it can be tested.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runTape } from "../src/engine/engine.js";
import {
  buildScreen,
  buildTiles,
  buildPipeline,
  buildAttribution,
  buildExpectations,
  bannerFor,
  TILE_ORDER,
} from "../src/ui/viewmodel.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../content/${name}`, import.meta.url), "utf8"));

const content = {
  variables: load("variables.json").variables,
  links: load("links.json").links,
  copy: load("copy.json"),
};

const hike = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 8 });
const oil = runTape([{ quarter: 1, energySupplyGap: 10 }], { quarters: 8 });
const screenAt = (path, n, opts = {}) =>
  buildScreen(path.slice(0, n), { explaining: "equity", ...opts }, content);

describe("the eight tiles", () => {
  test("every current has a tile, in the lesson's order", () => {
    const tiles = buildTiles(hike[0], null, content);

    assert.equal(tiles.length, 8);
    assert.deepEqual(tiles.map((t) => t.id), TILE_ORDER);
    for (const tile of tiles) assert.ok(tile.label && tile.value);
  });

  test("Q1 of a hike: growth and inflation read unchanged, markets do not", () => {
    const tiles = buildTiles(hike[0], null, content);
    const by = Object.fromEntries(tiles.map((t) => [t.id, t]));

    assert.equal(by.growth.value, "2.00");
    assert.equal(by.growth.moved, false);
    assert.equal(by.credit.moved, false);

    assert.equal(by.equity.moved, true);
    assert.equal(by.equity.direction, -1);
    assert.equal(by.treasuryYield.direction, 1);
  });

  test("the change is measured against the previous quarter, not the baseline", () => {
    const tiles = buildTiles(hike[2], hike[1], content);
    const credit = tiles.find((t) => t.id === "credit");

    // Credit fell from 97.79 to 95.55, so the change is about -2.2, not -4.4.
    assert.equal(credit.change, "−2.2");
  });

  test("no tile ever shows a signed zero", () => {
    for (const path of [hike, oil]) {
      for (let i = 0; i < path.length; i += 1) {
        for (const tile of buildTiles(path[i], path[i - 1] ?? null, content)) {
          assert.ok(!/^−0(\.0+)?$/.test(tile.change), `${tile.id} showed ${tile.change}`);
        }
      }
    }
  });
});

describe("expected against printed", () => {
  test("Q1 of a hike: the market has marked growth down before any figure", () => {
    const rows = buildExpectations(hike[0], content);
    const growth = rows.find((r) => r.id === "gExp");

    assert.equal(growth.expected, "1.70");
    assert.equal(growth.printedValue, "2.00");
    assert.equal(growth.diverged, true);
  });

  test("at baseline the two agree and nothing is flagged", () => {
    const flat = runTape([], { quarters: 1 })[0];
    for (const row of buildExpectations(flat, content)) assert.equal(row.diverged, false);
  });
});

describe("the pipeline meter", () => {
  test("only the four delayed variables get a meter", () => {
    const rows = buildPipeline(hike[0], content);
    assert.deepEqual(rows.map((r) => r.id).sort(), ["credit", "energy", "growth", "inflation"]);
  });

  test("Q1 of a hike: credit reads 100 now and 95.6 heading, and has not started", () => {
    const credit = buildPipeline(hike[0], content).find((r) => r.id === "credit");

    assert.equal(credit.current, "100.0");
    assert.equal(credit.target, "95.6");
    assert.equal(credit.progress, 0);
    assert.equal(credit.inFlight, true);
    assert.equal(credit.direction, -1);
    assert.equal(credit.offScale, false);
  });

  test("Q8 of a hike: the meter has nearly closed, with a hair still to travel", () => {
    const credit = buildPipeline(hike[7], content).find((r) => r.id === "credit");

    assert.ok(credit.progress > 0.95, `progress was ${credit.progress}`);
    // 94.65 against 94.63 still rounds to 94.7 against 94.6, so it is honest
    // to keep saying the meter is open.
    assert.equal(credit.inFlight, true);
  });

  test("in flight is decided at display precision, not by a hidden tolerance", () => {
    const long = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 12 });
    const credit = buildPipeline(long[8], content).find((r) => r.id === "credit");

    // By Q9 both print 94.6. A meter showing one number twice must not also
    // claim the variable is still moving.
    assert.equal(credit.current, credit.target);
    assert.equal(credit.inFlight, false);
    assert.equal(credit.direction, 0);
  });

  test("an off-scale target is clamped and flagged, never drawn wrong", () => {
    const extreme = runTape([{ quarter: 1, policyRate: 12, energySupplyGap: 140 }], {
      quarters: 12,
    });
    const rows = buildPipeline(extreme[11], content);

    assert.ok(rows.some((r) => r.offScale), "expected at least one off-scale target");
    for (const row of rows) {
      assert.ok(row.progress >= 0 && row.progress <= 1);
      assert.ok(!row.target.includes("NaN"));
    }
  });
});

describe("why did this move?", () => {
  test("Q1 of a hike: the discount rate leads and credit sits last at zero", () => {
    const panel = buildAttribution(hike[0], "equity", content);

    assert.equal(panel.terms.length, 4);
    assert.equal(panel.terms[0].id, "y_to_eq");
    assert.equal(panel.terms[0].label, "Discount rate");
    assert.equal(panel.terms[0].weight, 1, "the leading bar is full width");

    const last = panel.terms[3];
    assert.equal(last.id, "cred_to_eq");
    assert.equal(last.isZero, true);
    assert.equal(last.value, "0.0", "a zero shows as zero, not as a gap");
  });

  test("Q1 of an energy shock: the same fall, a different reason", () => {
    const panel = buildAttribution(oil[0], "equity", content);

    assert.equal(panel.terms[0].id, "e_to_eq", "energy leads, not the discount rate");
  });

  test("every explainable variable can be explained", () => {
    for (const variable of Object.keys(hike[1].contributions)) {
      const panel = buildAttribution(hike[1], variable, content);
      assert.ok(panel.terms.length > 0);
      for (const term of panel.terms) assert.ok(term.label, `${term.id} has no label`);
    }
  });

  test("asking about a variable with no contributions is a loud error", () => {
    assert.throws(() => buildAttribution(hike[0], "policyRate", content), /no contributions/);
  });
});

describe("the banner", () => {
  test("before the first quarter it invites you to set something", () => {
    assert.equal(bannerFor(null, content).kind, "baseline");
  });

  test("it is derived, not hard-coded to quarter one", () => {
    // Q1 of a hike: markets moved, the real economy has not.
    assert.equal(bannerFor(hike[0], content).kind, "shock");
    assert.match(bannerFor(hike[0], content).text, /real economy has not responded/);

    // Q2: credit has moved, so the line is no longer true and is withdrawn.
    assert.notEqual(bannerFor(hike[1], content)?.kind, "shock");
  });

  test("an energy shock earns the same line, because it is equally true", () => {
    assert.equal(bannerFor(oil[0], content).kind, "shock");
  });

  test("a quiet baseline run shows no banner at all", () => {
    const flat = runTape([], { quarters: 3 });
    assert.equal(bannerFor(flat[2], content), null);
  });

  test("the rule announces itself once the shock quarter has passed", () => {
    const ruled = runTape([{ quarter: 1, energySupplyGap: 10 }], {
      quarters: 4,
      policyMode: "taylor",
    });
    assert.equal(bannerFor(ruled[3], content).kind, "rule");
  });
});

describe("the whole screen", () => {
  test("quarter zero renders without a snapshot", () => {
    const screen = buildScreen([], {}, content);

    assert.equal(screen.quarter, 0);
    assert.equal(screen.tiles, null);
    assert.equal(screen.banner.kind, "baseline");
  });

  test("quarter one assembles every panel", () => {
    const screen = screenAt(hike, 1);

    assert.equal(screen.quarter, 1);
    assert.equal(screen.tiles.length, 8);
    assert.equal(screen.pipeline.length, 4);
    assert.equal(screen.expectations.length, 2);
    assert.equal(screen.attribution.variable, "equity");
    assert.equal(screen.explainable.length, 9);
  });

  test("every quarter of every card renders without throwing", () => {
    const experiments = JSON.parse(
      readFileSync(new URL("../content/experiments.json", import.meta.url), "utf8"),
    ).experiments;

    for (const card of experiments) {
      const path = runTape(card.tape, {
        quarters: card.quarters,
        policyMode: card.policyMode,
      });

      for (let n = 1; n <= path.length; n += 1) {
        for (const variable of Object.keys(path[0].contributions)) {
          const screen = screenAt(path, n, { explaining: variable });
          assert.equal(screen.quarter, n, `${card.id} Q${n} ${variable}`);
        }
      }
    }
  });
});
