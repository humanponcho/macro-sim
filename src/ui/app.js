/**
 * The Simulate screen.
 *
 * State is the tape and nothing else. Advancing pushes a quarter; stepping back
 * replays a shorter one. The engine is never asked to undo anything.
 */

import { runTape } from "../engine/engine.js";
import { buildScreen } from "./viewmodel.js";
import { stageEntry, withEntry, truncate, effectiveInputs, tapeLength } from "./tape.js";
import {
  el,
  renderBanner,
  renderTiles,
  renderExpectations,
  renderPipeline,
  renderAttribution,
} from "./render.js";

const MAX_QUARTERS = 24;

async function loadContent() {
  const names = ["variables", "links", "layers", "experiments", "glossary", "copy"];
  const files = await Promise.all(
    names.map((name) => fetch(`./content/${name}.json`).then((r) => r.json())),
  );

  const [variables, links, layers, experiments, glossary, copy] = files;
  return {
    variables: variables.variables,
    links: links.links,
    layers: layers.layers,
    experiments: experiments.experiments,
    glossary: glossary.glossary,
    copy,
  };
}

function createApp(content) {
  const { copy } = content;

  const state = {
    tape: [],
    quarter: 0,
    policyRate: copy.controls.policyRate.baseline,
    energySupplyGap: copy.controls.energySupplyGap.baseline,
    policyMode: "manual",
    explaining: "equity",
    // While a card is playing, the tape is authoritative and the controls
    // follow it. Touching a control takes the wheel back.
    playing: null,
  };

  const root = document.querySelector("#app");

  /** Show what the tape actually did, so the sliders never lie about the run. */
  function syncControlsToTape() {
    const now = effectiveInputs(state.tape, state.quarter, state.policyMode);
    state.policyRate = now.policyRate;
    state.energySupplyGap = now.energySupplyGap;
  }

  function advance() {
    if (state.quarter >= MAX_QUARTERS) return;

    if (state.playing) {
      // The card already supplies this quarter. Reveal it, do not rewrite it.
      if (state.quarter >= tapeLength(state.playing.tape) + state.playing.quarters) return;
      state.quarter += 1;
      syncControlsToTape();
      draw();
      return;
    }

    state.tape = withEntry(state.tape, stageEntry({ ...state }));
    state.quarter += 1;
    draw();
  }

  function back() {
    if (state.quarter === 0) return;
    state.quarter -= 1;
    if (!state.playing) state.tape = truncate(state.tape, state.quarter);
    syncControlsToTape();
    draw();
  }

  function reset() {
    state.tape = [];
    state.quarter = 0;
    state.playing = null;
    state.policyRate = copy.controls.policyRate.baseline;
    state.energySupplyGap = copy.controls.energySupplyGap.baseline;
    draw();
  }

  /** A control moved. Take the wheel back from whatever card was playing. */
  function takeTheWheel() {
    if (!state.playing) return;
    state.playing = null;
    state.tape = truncate(state.tape, state.quarter);
  }

  function loadCard(id) {
    const card = content.experiments.find((c) => c.id === id);
    if (!card) return reset();

    state.playing = card;
    state.tape = card.tape.map((entry) => ({ ...entry }));
    state.policyMode = card.policyMode;
    state.quarter = 0;
    syncControlsToTape();
    draw();
  }

  function slider(key, config) {
    return el("label", { class: "control" }, [
      el("span", { class: "control__label", text: config.label }),
      el("span", { class: "control__row" }, [
        el("input", {
          type: "range",
          min: config.min,
          max: config.max,
          step: config.step,
          value: state[key],
          "aria-label": config.label,
          oninput: (event) => {
            takeTheWheel();
            state[key] = Number(event.target.value);
            draw();
          },
        }),
        el("output", { class: "control__value", text: String(state[key]) }),
      ]),
      el("span", { class: "control__help", text: config.help }),
    ]);
  }

  function renderControls() {
    const modes = copy.controls.policyMode.options;

    return el("section", { class: "controls" }, [
      slider("policyRate", copy.controls.policyRate),
      slider("energySupplyGap", copy.controls.energySupplyGap),
      el("label", { class: "control" }, [
        el("span", { class: "control__label", text: copy.controls.policyMode.label }),
        el(
          "select",
          {
            class: "picker",
            onchange: (event) => {
              takeTheWheel();
              state.policyMode = event.target.value;
              draw();
            },
          },
          Object.entries(modes).map(([value, label]) =>
            el("option", { value, text: label, selected: value === state.policyMode }),
          ),
        ),
        el("span", { class: "control__help", text: copy.controls.policyMode.help }),
      ]),
      el("div", { class: "actions" }, [
        el("button", {
          class: "button button--primary",
          text: copy.actions.advance,
          onclick: advance,
          disabled: state.quarter >= MAX_QUARTERS,
        }),
        el("button", {
          class: "button",
          text: copy.actions.back,
          onclick: back,
          disabled: state.quarter === 0,
        }),
        el("button", { class: "button", text: copy.actions.reset, onclick: reset }),
      ]),
      el("label", { class: "control control--cards" }, [
        el("span", { class: "control__label", text: "Shock cards" }),
        el(
          "select",
          {
            class: "picker",
            onchange: (event) => loadCard(event.target.value),
          },
          [
            el("option", { value: "", text: "Choose an experiment…" }),
            ...content.experiments.map((card) =>
              el("option", { value: card.id, text: card.title }),
            ),
          ],
        ),
      ]),
    ]);
  }

  function draw() {
    const snapshots = runTape(state.tape, {
      quarters: state.quarter,
      policyMode: state.policyMode,
    });
    const screen = buildScreen(snapshots, { explaining: state.explaining }, content);

    root.replaceChildren(
      el("header", { class: "masthead" }, [
        el("h1", { class: "masthead__title", text: copy.app.title }),
        el("p", { class: "masthead__subtitle", text: copy.app.subtitle }),
        el("p", { class: "masthead__quarter" }, [
          el("span", { class: "masthead__caption", text: copy.labels.quarter }),
          el("span", { class: "masthead__number", text: String(screen.quarter) }),
        ]),
      ]),
      renderControls(),
      state.playing
        ? el("p", { class: "banner banner--card" }, [
            el("strong", { text: `${state.playing.title}. ` }),
            document.createTextNode(state.playing.teacherLine),
          ])
        : null,
      renderBanner(screen.banner),
      screen.tiles ? renderTiles(screen.tiles, copy) : null,
      screen.expectations ? renderExpectations(screen.expectations, copy) : null,
      screen.pipeline ? renderPipeline(screen.pipeline, copy) : null,
      screen.attribution
        ? renderAttribution(
            screen.attribution,
            screen.explainable,
            copy,
            content.variables,
            (variable) => {
              state.explaining = variable;
              draw();
            },
          )
        : null,
      el("footer", { class: "footnote" }, [
        el("p", { text: copy.footer.disclaimer }),
        el("p", { text: copy.footer.outOfScope }),
      ]),
    );
  }

  // Space advances a quarter, so a teacher can drive the lesson from the back
  // of the room without hunting for a button.
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, select, button")) return;
    if (event.code === "Space") {
      event.preventDefault();
      advance();
    }
    if (event.code === "Backspace") {
      event.preventDefault();
      back();
    }
  });

  draw();
}

loadContent().then(createApp).catch((error) => {
  document.querySelector("#app").replaceChildren(
    el("p", { class: "banner banner--error" }, [
      `The lesson content did not load: ${error.message}. `,
      "Run the app with a server rather than opening the file directly: npm start",
    ]),
  );
});

