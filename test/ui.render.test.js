/**
 * The DOM layer, rendered against a minimal document stub.
 *
 * render.js touches only createElement, createTextNode, className,
 * textContent, setAttribute, addEventListener and append, so a few dozen lines
 * of stub exercise it honestly without a browser or a dependency. This catches
 * the failures a screenshot would: a missing content key rendering "undefined",
 * a signed zero, or a NaN width reaching an inline style.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runTape } from "../src/engine/engine.js";
import { buildScreen } from "../src/ui/viewmodel.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../content/${name}`, import.meta.url), "utf8"));

const content = {
  variables: load("variables.json").variables,
  links: load("links.json").links,
  experiments: load("experiments.json").experiments,
  copy: load("copy.json"),
};

/** --- the stub --- */
class StubNode {
  constructor(tag) {
    this.tag = tag;
    this.className = "";
    this.textContent = "";
    this.attributes = {};
    this.children = [];
    this.listeners = {};
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  append(...nodes) { this.children.push(...nodes); }
}

function installStubDom() {
  globalThis.document = {
    createElement: (tag) => new StubNode(tag),
    createTextNode: (text) => String(text),
  };
}

/** All text in a rendered tree, in document order. */
function textOf(node) {
  if (typeof node === "string") return node;
  if (!node) return "";
  const own = node.textContent ?? "";
  return own + node.children.map(textOf).join(" ");
}

/** Every node in a rendered tree. */
function walk(node, out = []) {
  if (!node || typeof node === "string") return out;
  out.push(node);
  for (const child of node.children) walk(child, out);
  return out;
}

const classesOf = (node) => walk(node).map((n) => n.className);

let render;

before(async () => {
  installStubDom();
  render = await import("../src/ui/render.js");
});

const hike = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 8 });
const screenFor = (path, n, explaining = "equity") =>
  buildScreen(path.slice(0, n), { explaining }, content);

describe("the eight tiles render", () => {
  test("every current appears with its label and value", () => {
    const tree = render.renderTiles(screenFor(hike, 1).tiles, content.copy);
    const text = textOf(tree);

    assert.match(text, /Growth/);
    assert.match(text, /Equity valuations/);
    assert.match(text, /94\.4/, "equity should print 94.4");
    assert.match(text, /4\.50/, "the policy rate should print to two decimals");
    const tiles = walk(tree).filter((n) => n.className.split(" ")[0] === "tile");
    assert.equal(tiles.length, 8);
  });

  test("an unmoved tile says so in words, not as a bare zero", () => {
    const text = textOf(render.renderTiles(screenFor(hike, 1).tiles, content.copy));
    assert.match(text, /no change/);
  });

  test("direction is carried in a class, not only in colour", () => {
    const classes = classesOf(render.renderTiles(screenFor(hike, 1).tiles, content.copy));

    assert.ok(classes.includes("tile tile--down"), "a fall needs a class of its own");
    assert.ok(classes.includes("tile tile--up"));
  });
});

describe("the pipeline meter renders", () => {
  test("Q1 of a hike shows 100.0 heading for 95.6", () => {
    const text = textOf(render.renderPipeline(screenFor(hike, 1).pipeline, content.copy));

    assert.match(text, /100\.0/);
    assert.match(text, /95\.6/);
    assert.match(text, /Heading for/);
  });

  test("the fill width is always a real percentage", () => {
    for (let n = 1; n <= 8; n += 1) {
      const tree = render.renderPipeline(screenFor(hike, n).pipeline, content.copy);
      for (const node of walk(tree)) {
        if (node.className !== "meter__fill") continue;
        const width = node.attributes.style;
        assert.match(width, /^width:\d+(\.\d+)?%$/, `bad width "${width}"`);
      }
    }
  });

  test("the track carries a text label for screen readers", () => {
    const tree = render.renderPipeline(screenFor(hike, 1).pipeline, content.copy);
    const track = walk(tree).find((n) => n.className === "meter__track");

    assert.match(track.attributes["aria-label"], /percent of the way to/);
  });
});

describe("the attribution panel renders", () => {
  test("Q1 of a hike leads with the discount rate and ends with a zero", () => {
    const screen = screenFor(hike, 1);
    const tree = render.renderAttribution(
      screen.attribution, screen.explainable, content.copy, content.variables, () => {},
    );
    const labels = walk(tree).filter((n) => n.className === "bar__label").map((n) => n.textContent);
    const values = walk(tree).filter((n) => n.className === "bar__value").map((n) => n.textContent);

    // Ranked by absolute effect, so the zero sorts last however small the
    // energy term is.
    assert.deepEqual(labels, ["Discount rate", "Expected profits", "Energy costs", "Credit conditions"]);
    assert.equal(values[0], "−3.4");
    assert.equal(values[3], "0.0", "the zero is shown last, not omitted");
  });

  test("a zero term earns the explanation of why it is zero", () => {
    const screen = screenFor(hike, 1);
    const text = textOf(render.renderAttribution(
      screen.attribution, screen.explainable, content.copy, content.variables, () => {},
    ));

    assert.match(text, /contributed nothing this quarter/);
  });

  test("the picker offers every explainable variable and marks the current one", () => {
    const screen = screenFor(hike, 2, "credit");
    const tree = render.renderAttribution(
      screen.attribution, screen.explainable, content.copy, content.variables, () => {},
    );
    const options = walk(tree).filter((n) => n.tag === "option");

    assert.equal(options.length, 9);
    const selected = options.filter((o) => o.attributes.selected !== undefined);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].attributes.value, "credit");
  });
});

describe("nothing broken reaches the screen", () => {
  test("no undefined, NaN or signed zero in any panel of any card", () => {
    for (const card of content.experiments) {
      const path = runTape(card.tape, {
        quarters: card.quarters,
        policyMode: card.policyMode,
      });

      for (let n = 1; n <= path.length; n += 1) {
        for (const variable of Object.keys(path[0].contributions)) {
          const screen = screenFor(path, n, variable);

          const panels = [
            render.renderBanner(screen.banner),
            render.renderTiles(screen.tiles, content.copy),
            render.renderExpectations(screen.expectations, content.copy),
            render.renderPipeline(screen.pipeline, content.copy),
            render.renderAttribution(
              screen.attribution, screen.explainable, content.copy, content.variables, () => {},
            ),
          ];

          for (const panel of panels) {
            const text = textOf(panel);
            const where = `${card.id} Q${n} ${variable}`;

            assert.ok(!text.includes("undefined"), `${where}: "undefined" on screen`);
            assert.ok(!text.includes("NaN"), `${where}: "NaN" on screen`);
            // A minus on a zero. The lookahead keeps legitimate values such as
            // "−0.06" from matching.
            assert.ok(!/−0(\.0+)?(?![\d.])/.test(text), `${where}: a signed zero on screen`);

            for (const node of walk(panel)) {
              const style = node.attributes.style;
              if (style) assert.ok(!style.includes("NaN"), `${where}: NaN in a style`);
            }
          }
        }
      }
    }
  });

  test("the shock banner appears in the shock quarter and is withdrawn after", () => {
    assert.match(textOf(render.renderBanner(screenFor(hike, 1).banner)), /real economy has not responded/);
    const later = render.renderBanner(screenFor(hike, 2).banner);
    if (later) assert.doesNotMatch(textOf(later), /real economy has not responded/);
  });
});
