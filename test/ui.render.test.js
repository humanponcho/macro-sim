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
  layers: load("layers.json").layers,
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
  // The real one stringifies anything that is not a Node, which is exactly
  // how "null" ended up printed between the panels.
  replaceChildren(...nodes) { this.children = nodes.map((n) => (n === null ? "null" : n)); }
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

/* --- phase 4: map and cards --- */

describe("the layer map renders", () => {
  const layers = load("layers.json").layers;
  const mapContent = { ...content, layers };

  test("all ten tiles render, bottom layer last in the list", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const tree = render.renderMap(buildMap(mapContent, hike[0], null), content.copy, () => {});
    const numbers = walk(tree)
      .filter((n) => n.className === "layer__number")
      .map((n) => Number(n.textContent));

    assert.equal(numbers.length, 10);
    // Read bottom up: layer 1 sits at the foot of the stack, so it renders last.
    assert.deepEqual(numbers, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  test("no tile has a blank title, badge or activity", async () => {
    const { buildMap } = await import("../src/ui/map.js");

    for (let q = 0; q <= 8; q += 1) {
      const tiles = buildMap(mapContent, q ? hike[q - 1] : null, q > 1 ? hike[q - 2] : null);
      const tree = render.renderMap(tiles, content.copy, () => {});

      for (const cls of ["layer__title", "layer__badge", "layer__activity"]) {
        const nodes = walk(tree).filter((n) => n.className === cls);
        assert.equal(nodes.length, 10, `Q${q}: expected ten ${cls}`);
        for (const node of nodes) {
          assert.ok(node.textContent.trim(), `Q${q}: a blank ${cls}`);
          assert.ok(!node.textContent.includes("undefined"), `Q${q}: undefined in ${cls}`);
        }
      }
    }
  });

  test("every layer that omits something shows its sentence", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const tiles = buildMap(mapContent, hike[0], null);
    const tree = render.renderMap(tiles, content.copy, () => {});
    const omissions = walk(tree).filter((n) => n.className === "layer__omission");

    const expected = tiles.filter((t) => t.notSimulated.length > 0).length;
    assert.equal(omissions.length, expected);
    for (const node of omissions) assert.match(node.textContent, /Not simulated here:/);
  });

  test("only selectable layers render a button", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const tiles = buildMap(mapContent, hike[0], null);
    const tree = render.renderMap(tiles, content.copy, () => {});
    const buttons = walk(tree).filter((n) => n.tag === "button");

    assert.equal(buttons.length, tiles.filter((t) => t.selectable).length);
    assert.ok(buttons.length > 0);
  });

  test("clicking a layer calls back with its number and nothing else", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const clicks = [];
    const tiles = buildMap(mapContent, hike[2], hike[1]);
    const tree = render.renderMap(tiles, content.copy, (n) => clicks.push(n));

    for (const node of walk(tree)) {
      if (node.tag === "button" && node.listeners.click) node.listeners.click();
    }

    // The map renders bottom-up, so clicks arrive in reverse layer order.
    assert.deepEqual(
      clicks,
      [...tiles].reverse().filter((t) => t.selectable).map((t) => t.number),
    );
    assert.ok(!clicks.includes(7), "layer 7 is a read, not a control");
  });
});

describe("the card screen renders", () => {
  const experiments = load("experiments.json").experiments;

  const viewFor = (card, quarter, predictions = {}, answerShown = false) => ({
    quarter,
    predictions,
    cues: card.watchFor.filter((c) => c.quarter <= quarter),
    finished: quarter >= card.quarters,
    answerShown,
    onPredict: () => {},
    onAdvance: () => {},
    onBack: () => {},
    onReset: () => {},
    onRevealAnswer: () => {},
  });

  test("the prediction checklist gates the first advance", () => {
    const card = experiments[0];
    const tree = render.renderCard(card, viewFor(card, 0), content.copy, content.variables);
    const advance = walk(tree).find((n) => n.className.includes("button--primary"));

    assert.equal(advance.attributes.disabled, "");
    assert.match(textOf(tree), /Answer every line before you advance/);
  });

  test("answering every line opens the gate", () => {
    const card = experiments[0];
    const answers = Object.fromEntries(card.predict.map((p) => [p.variable, p.answer]));
    const tree = render.renderCard(card, viewFor(card, 0, answers), content.copy, content.variables);
    const advance = walk(tree).find((n) => n.className.includes("button--primary"));

    assert.equal(advance.attributes.disabled, undefined);
  });

  test("an answer is marked, and its reason is revealed", () => {
    const card = experiments[0];
    const tree = render.renderCard(
      card, viewFor(card, 0, { credit: "still" }), content.copy, content.variables,
    );

    assert.ok(walk(tree).some((n) => n.className === "predict__mark predict__mark--right"));
    assert.match(textOf(tree), /Credit reads the previous quarter/);
  });

  test("a wrong answer is marked wrong, not hidden", () => {
    const card = experiments[0];
    const tree = render.renderCard(
      card, viewFor(card, 0, { credit: "moves" }), content.copy, content.variables,
    );

    assert.ok(walk(tree).some((n) => n.className === "predict__mark predict__mark--wrong"));
  });

  test("cues appear only once their quarter is reached", () => {
    const card = experiments.find((c) => c.id === "hike_held");

    assert.doesNotMatch(
      textOf(render.renderCard(card, viewFor(card, 0), content.copy, content.variables)),
      /credit starts to tighten/i,
    );
    assert.match(
      textOf(render.renderCard(card, viewFor(card, 2), content.copy, content.variables)),
      /credit starts to tighten/i,
    );
  });

  test("the closing question appears only at the end of the run", () => {
    const card = experiments[0];

    assert.doesNotMatch(
      textOf(render.renderCard(card, viewFor(card, 3), content.copy, content.variables)),
      /Open the attribution panel/,
    );
    assert.match(
      textOf(render.renderCard(card, viewFor(card, card.quarters), content.copy, content.variables)),
      /Open the attribution panel/,
    );
  });

  test("the card's answer is held back until the room has been asked", () => {
    const card = experiments[0];
    const asked = render.renderCard(card, viewFor(card, card.quarters), content.copy, content.variables);
    const shown = render.renderCard(
      card, viewFor(card, card.quarters, {}, true), content.copy, content.variables,
    );

    assert.doesNotMatch(textOf(asked), /Credit contributed exactly zero/);
    assert.match(textOf(asked), /Show the answer/);
    assert.match(textOf(shown), /Credit contributed exactly zero/);
  });

  test("every card renders at every quarter with nothing blank", () => {
    for (const card of experiments) {
      for (let q = 0; q <= card.quarters; q += 1) {
        const text = textOf(
          render.renderCard(card, viewFor(card, q), content.copy, content.variables),
        );
        assert.ok(!text.includes("undefined"), `${card.id} Q${q}`);
        assert.ok(!text.includes("NaN"), `${card.id} Q${q}`);
      }
    }
  });
});

/* --- phase 5: drawer and exit ticket --- */

describe("the glossary drawer renders", () => {
  const glossaryContent = { ...content, glossary: load("glossary.json").glossary };

  test("every term and meaning appears, nothing blank", async () => {
    const { buildGlossary } = await import("../src/ui/study.js");
    const model = buildGlossary(glossaryContent);
    const tree = render.renderGlossary(model, content.copy, {
      onClose(){}, onSearch(){}, onWatch(){},
    });

    const terms = walk(tree).filter((n) => n.className === "drawer__term");
    assert.equal(terms.length, model.entries.length);
    for (const node of terms) assert.ok(textOf(node).trim());
    assert.ok(!textOf(tree).includes("undefined"));
  });

  test("a watchable term offers to show it on screen", async () => {
    const { buildGlossary } = await import("../src/ui/study.js");
    const model = buildGlossary(glossaryContent, { query: "yield" });
    const watched = [];
    const tree = render.renderGlossary(model, content.copy, {
      onClose(){}, onSearch(){}, onWatch: (v) => watched.push(v),
    });

    for (const node of walk(tree)) {
      if (node.className === "drawer__watch") node.listeners.click();
    }
    assert.ok(watched.includes("treasuryYield"));
  });

  test("an empty search says so instead of showing everything", async () => {
    const { buildGlossary } = await import("../src/ui/study.js");
    const tree = render.renderGlossary(
      buildGlossary(glossaryContent, { query: "zzzzz" }), content.copy,
      { onClose(){}, onSearch(){}, onWatch(){} },
    );

    assert.match(textOf(tree), /No term matches that/);
    assert.equal(walk(tree).filter((n) => n.className === "drawer__term").length, 0);
  });
});

describe("the exit ticket renders", () => {
  const ticketContent = { ...content, layers: load("layers.json").layers };
  const handlers = { onAnswer(){}, onReveal(){}, onReset(){} };

  test("all five questions render with their options", async () => {
    const { buildExitTicket } = await import("../src/ui/study.js");
    const tree = render.renderExitTicket(buildExitTicket(ticketContent), content.copy, handlers);

    assert.equal(walk(tree).filter((n) => n.className.startsWith("ticket__q")).length, 5);
    assert.ok(!textOf(tree).includes("undefined"));
  });

  test("an unanswered markable question hides its answer", async () => {
    const { buildExitTicket } = await import("../src/ui/study.js");
    const tree = render.renderExitTicket(buildExitTicket(ticketContent), content.copy, handlers);

    assert.doesNotMatch(textOf(tree), /The answer is Equity valuations/);
  });

  test("a wrong answer is marked and still shows the reason", async () => {
    const { buildExitTicket } = await import("../src/ui/study.js");
    const model = buildExitTicket(ticketContent, { answers: { moved_first: "credit" } });
    const tree = render.renderExitTicket(model, content.copy, handlers);

    assert.match(textOf(tree), /Not quite/);
    assert.match(textOf(tree), /The answer is Equity valuations/);
    assert.match(textOf(tree), /Credit reads the previous quarter/);
    assert.ok(walk(tree).some((n) => n.className.includes("ticket__q--wrong")));
  });

  test("an open question reveals only on request", async () => {
    const { buildExitTicket } = await import("../src/ui/study.js");
    const hidden = render.renderExitTicket(buildExitTicket(ticketContent), content.copy, handlers);
    const shown = render.renderExitTicket(
      buildExitTicket(ticketContent, { revealed: { why_slow: true } }), content.copy, handlers,
    );

    assert.doesNotMatch(textOf(hidden), /credit, energy and wealth/);
    assert.match(textOf(shown), /credit, energy and wealth/);
  });

  test("answering every markable question shows the closing line", async () => {
    const { buildExitTicket } = await import("../src/ui/study.js");
    const answers = { moved_first: "equity", bond_rule: "It falls", place_drought: 2, place_jobs: 5 };
    const tree = render.renderExitTicket(
      buildExitTicket(ticketContent, { answers }), content.copy, handlers,
    );

    assert.match(textOf(tree), /You do not need to forecast the economy/);
    assert.match(textOf(tree), /Answered 4 of 5/);
  });
});

/* --- regressions found on the real page --- */

describe("no panel gap ever prints the word null", () => {
  // draw() builds the screen as `condition ? panel : null`, and
  // Node.replaceChildren turns a null into the text "null". The page showed
  // "nullnullnullnullnullnullnullnullnull" between its panels.
  test("mount drops null, undefined and false", () => {
    const root = new StubNode("main");

    render.mount(root, render.el("p", { text: "kept" }), null, undefined, false,
                 render.el("p", { text: "also kept" }));

    assert.equal(root.children.length, 2);
    assert.equal(textOf(root), "kept also kept");
    assert.ok(!textOf(root).includes("null"));
  });

  test("a screen that is mostly empty panels renders nothing but the real ones", () => {
    // Quarter zero: every panel below the banner is absent.
    const root = new StubNode("main");
    const screen = buildScreen([], {}, content);

    render.mount(
      root,
      render.el("h1", { text: "Macro-Sim" }),
      render.renderBanner(screen.banner),
      screen.tiles ? render.renderTiles(screen.tiles, content.copy) : null,
      screen.expectations ? render.renderExpectations(screen.expectations, content.copy) : null,
      screen.pipeline ? render.renderPipeline(screen.pipeline, content.copy) : null,
      null, null, null, null,
      render.el("footer", { text: "note" }),
    );

    assert.equal(root.children.length, 3, "title, banner and footer only");
    assert.ok(!textOf(root).includes("null"), textOf(root));
  });
});

describe("the omission sentence tells the truth about its own layer", () => {
  const layers = load("layers.json").layers;
  const mapContent = { ...content, layers };

  test("a simulated layer never claims the model does not compute it", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const tiles = buildMap(mapContent, hike[0], null);
    const lie = content.copy.explanations.notSimulated;

    for (const tile of tiles) {
      if (tile.mode !== "simulated" || !tile.omission) continue;
      assert.ok(
        !tile.omission.includes(lie),
        `L${tile.number} is simulated but says "${lie}"`,
      );
    }
  });

  test("layer 7 names its omissions without denying that it is simulated", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const bank = buildMap(mapContent, hike[0], null).find((t) => t.number === 7);

    assert.equal(bank.mode, "simulated");
    assert.equal(bank.omission, "Not simulated here: fiscal policy, quantitative easing and bank regulation.");
  });

  test("a spoken layer still says the model does not compute it", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const trade = buildMap(mapContent, hike[0], null).find((t) => t.number === 4);

    assert.equal(trade.mode, "discussed");
    assert.match(trade.omission, /the model does not compute it/);
  });

  test("a partial layer says it is partly computed, not that it is absent", async () => {
    const { buildMap } = await import("../src/ui/map.js");
    const labour = buildMap(mapContent, hike[0], null).find((t) => t.number === 5);

    assert.equal(labour.mode, "partial");
    assert.match(labour.omission, /computes part of this layer/);
    assert.ok(!labour.omission.includes("does not compute it"));
  });
});
