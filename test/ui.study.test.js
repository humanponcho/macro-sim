/**
 * The glossary drawer and the exit ticket.
 *
 * Both are content-driven, so the tests hold the content to its promises as
 * much as the code: no dangling cross-reference, no question whose answer is
 * not among its options, no layer that does not exist.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildGlossary,
  danglingReferences,
  buildExitTicket,
  validateExitTicket,
  labelForAnswer,
} from "../src/ui/study.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../content/${name}`, import.meta.url), "utf8"));

const content = {
  variables: load("variables.json").variables,
  links: load("links.json").links,
  layers: load("layers.json").layers,
  glossary: load("glossary.json").glossary,
  copy: load("copy.json"),
};

describe("the glossary drawer", () => {
  test("every term resolves, and none points at nothing", () => {
    assert.deepEqual(danglingReferences(content), []);
  });

  test("terms come back in alphabetical order", () => {
    const { entries } = buildGlossary(content);
    const sorted = [...entries].sort((a, b) => a.term.localeCompare(b.term));

    assert.deepEqual(entries.map((e) => e.term), sorted.map((e) => e.term));
    assert.ok(entries.length > 20, "the glossary should be substantial");
  });

  test("a term tied to a readout is flagged as watchable on screen", () => {
    const { entries } = buildGlossary(content);
    const yieldTerm = entries.find((e) => e.key === "yield");

    assert.equal(yieldTerm.onScreen, true);
    assert.equal(yieldTerm.variable, "treasuryYield");
    assert.equal(yieldTerm.variableLabel, "Treasury yield");
  });

  test("a term with no engine home is not pretended to have one", () => {
    const { entries } = buildGlossary(content);
    const fiscal = entries.find((e) => e.key === "fiscalPolicy");

    assert.equal(fiscal.onScreen, false);
    assert.equal(fiscal.variable, null);
    assert.match(fiscal.plain, /not simulated here/i);
  });

  test("searching narrows by term and by meaning", () => {
    assert.ok(buildGlossary(content, { query: "bond" }).entries.length >= 2);

    // "IOU" appears in the meaning of bond, not in any term.
    const byMeaning = buildGlossary(content, { query: "IOU" });
    assert.ok(byMeaning.entries.some((e) => e.key === "bond"));
  });

  test("a search that finds nothing says so rather than showing everything", () => {
    const none = buildGlossary(content, { query: "zzzzz" });

    assert.equal(none.entries.length, 0);
    assert.equal(none.empty, true);
    assert.ok(none.total > 0, "the total still reports the whole glossary");
  });

  test("cross-references carry the other term's display name", () => {
    const { entries } = buildGlossary(content);
    const bond = entries.find((e) => e.key === "bond");

    assert.ok(bond.seeAlso.length > 0);
    for (const ref of bond.seeAlso) {
      assert.ok(ref.term, `${ref.key} has no display name`);
      assert.ok(content.glossary[ref.key]);
    }
  });

  test("selection marks exactly one entry", () => {
    const { entries } = buildGlossary(content, { selected: "credit" });
    assert.deepEqual(entries.filter((e) => e.selected).map((e) => e.key), ["credit"]);
  });
});

describe("the exit ticket", () => {
  test("every question is answerable and its answer is a real one", () => {
    assert.deepEqual(validateExitTicket(content), []);
  });

  test("five questions, and each gives a reason", () => {
    const ticket = buildExitTicket(content);

    assert.equal(ticket.total, 5);
    for (const question of ticket.questions) {
      assert.ok(question.ask, `${question.id} asks nothing`);
      assert.ok(question.because, `${question.id} explains nothing`);
    }
  });

  test("a variable question offers labels, not engine ids", () => {
    const ticket = buildExitTicket(content);
    const q = ticket.questions.find((q) => q.id === "moved_first");

    assert.deepEqual(q.options.map((o) => o.value), ["equity", "credit", "growth"]);
    assert.deepEqual(q.options.map((o) => o.label), [
      "Equity valuations",
      "Credit conditions",
      "Growth",
    ]);
  });

  test("a layer question offers all ten layers by name", () => {
    const q = buildExitTicket(content).questions.find((q) => q.id === "place_drought");

    assert.equal(q.options.length, 10);
    assert.equal(q.options[1].label, "2. Energy and natural resources");
  });

  test("answering marks immediately and reveals the reason either way", () => {
    const right = buildExitTicket(content, { answers: { moved_first: "equity" } });
    const wrong = buildExitTicket(content, { answers: { moved_first: "credit" } });

    const r = right.questions.find((q) => q.id === "moved_first");
    const w = wrong.questions.find((q) => q.id === "moved_first");

    assert.equal(r.correct, true);
    assert.equal(w.correct, false);
    assert.equal(r.revealed, true);
    assert.equal(w.revealed, true, "a wrong answer must still see the reason");
  });

  test("an open question is never marked right or wrong", () => {
    const ticket = buildExitTicket(content, { answers: { why_slow: "because of lags" } });
    const q = ticket.questions.find((q) => q.id === "why_slow");

    assert.equal(q.markable, false);
    assert.equal(q.correct, null);
    assert.equal(q.options.length, 0);
  });

  test("an open question reveals its model answer only when asked", () => {
    const hidden = buildExitTicket(content).questions.find((q) => q.id === "why_slow");
    const shown = buildExitTicket(content, { revealed: { why_slow: true } })
      .questions.find((q) => q.id === "why_slow");

    assert.equal(hidden.revealed, false);
    assert.equal(shown.revealed, true);
    assert.match(shown.answer, /credit, energy and wealth/);
  });

  test("the score counts only markable questions", () => {
    const ticket = buildExitTicket(content, {
      answers: { moved_first: "equity", bond_rule: "It falls", place_drought: 2, place_jobs: 5 },
    });

    assert.equal(ticket.markable, 4);
    assert.equal(ticket.right, 4);
    assert.equal(ticket.answered, 4);
    assert.equal(ticket.complete, true, "the open question does not block completion");
  });

  test("the answer is shown as a reader sees it, not as an id", () => {
    const questions = content.copy.exitTicket.questions;

    assert.equal(labelForAnswer(questions[0], content), "Equity valuations");
    assert.equal(labelForAnswer(questions[2], content), "2. Energy and natural resources");
  });
});

describe("the ticket agrees with the model it is testing", () => {
  test("the shock-quarter question is true of the engine", async () => {
    const { runTape } = await import("../src/engine/engine.js");
    const first = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 1 })[0];

    // "Which has already moved?" The answer must actually be the one that did.
    assert.notEqual(first.equity, 100, "equity must have moved for the answer to hold");
    assert.equal(first.credit, 100, "credit must not have moved");
    assert.equal(first.growth, 2, "growth must not have moved");
  });

  test("a question that names a layer names one the map really has", () => {
    for (const question of content.copy.exitTicket.questions) {
      if (question.kind !== "layer") continue;
      const layer = content.layers.find((l) => l.number === question.answer);

      assert.ok(layer, `${question.id} names layer ${question.answer}`);
    }
  });

  test("the jobs question points at a layer that admits it does not simulate jobs", () => {
    const q = content.copy.exitTicket.questions.find((q) => q.id === "place_jobs");
    const layer = content.layers.find((l) => l.number === q.answer);

    assert.ok(
      layer.notSimulated.some((item) => /employment|wages/i.test(item)),
      "the answer would be dishonest if that layer claimed to simulate jobs",
    );
  });
});
