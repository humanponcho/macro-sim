/**
 * The Simulate screen.
 *
 * State is the tape and nothing else. Advancing pushes a quarter; stepping back
 * replays a shorter one. The engine is never asked to undo anything.
 */

import { runTape } from "../engine/engine.js";
import { buildScreen } from "./viewmodel.js";
import { stageEntry, withEntry, truncate, effectiveInputs, tapeLength } from "./tape.js";
import { buildMap, buildLayerPanel } from "./map.js";
import { buildGlossary, buildExitTicket } from "./study.js";
import {
  el,
  renderBanner,
  renderTiles,
  renderExpectations,
  renderPipeline,
  renderAttribution,
  renderMap,
  renderLayerPanel,
  renderCard,
  renderGlossary,
  renderExitTicket,
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
    view: "simulate",
    selectedLayer: null,
    predictions: {},
    drawerOpen: false,
    glossaryQuery: "",
    cardAnswerShown: false,
    ticketAnswers: {},
    ticketRevealed: {},
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

  /**
   * Select a layer. This is a read: it opens the attribution panel for the
   * layer's variables and changes no input. Cards move the rate. The map
   * does not.
   */
  function selectLayer(number) {
    state.selectedLayer = state.selectedLayer === number ? null : number;

    const panel = state.selectedLayer
      ? buildLayerPanel(content, state.selectedLayer, null)
      : null;
    const first = panel?.variableLabels.find((v) => content.variables[v.id])?.id;
    if (first && state.quarter > 0) {
      const snapshots = runTape(state.tape, {
        quarters: state.quarter,
        policyMode: state.policyMode,
      });
      const last = snapshots[snapshots.length - 1];
      if (last?.contributions?.[first]) state.explaining = first;
    }

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

    state.predictions = {};
    state.cardAnswerShown = false;
    state.playing = card;
    state.tape = card.tape.map((entry) => ({ ...entry }));
    state.policyMode = card.policyMode;
    state.quarter = 0;
    syncControlsToTape();
    draw();
  }

  function slider(key, config) {
    const readout = el("output", { class: "control__value", text: String(state[key]) });

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
          // While the thumb is moving, update the state and the readout in
          // place. Do NOT redraw: draw() replaces the whole tree, which
          // destroys this input under the pointer and stops the drag dead.
          // Nothing else on screen depends on this value until the next
          // quarter is run, so there is nothing else to update.
          oninput: (event) => {
            takeTheWheel();
            state[key] = Number(event.target.value);
            readout.textContent = String(state[key]);
          },
          // Released, or committed from the keyboard. Now it is safe to redraw,
          // which is what picks up the end of a card being played.
          onchange: () => draw(),
        }),
        readout,
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

  function renderNav() {
    const views = [
      ["simulate", "Simulate"],
      ["map", copy.panels.map],
      ["cards", "Shock cards"],
      ["check", copy.exitTicket.title],
    ];

    return el("nav", { class: "nav" }, [
      ...views.map(([id, label]) =>
        el("button", {
          type: "button",
          class: "nav__tab" + (state.view === id ? " nav__tab--on" : ""),
          "aria-pressed": String(state.view === id),
          text: label,
          onclick: () => {
            state.view = id;
            draw();
          },
        }),
      ),
      el("button", {
        type: "button",
        class: "nav__drawer",
        "aria-pressed": String(state.drawerOpen),
        text: copy.glossaryDrawer.open,
        onclick: () => {
          state.drawerOpen = !state.drawerOpen;
          draw();
        },
      }),
    ]);
  }

  function draw() {
    const snapshots = runTape(state.tape, {
      quarters: state.quarter,
      policyMode: state.policyMode,
    });
    const screen = buildScreen(snapshots, { explaining: state.explaining }, content);
    const snapshot = snapshots[snapshots.length - 1] ?? null;
    const previous = snapshots[snapshots.length - 2] ?? null;

    const mapTiles = buildMap(content, snapshot, previous, state.selectedLayer);
    const layerPanel = state.selectedLayer
      ? buildLayerPanel(content, state.selectedLayer, snapshot)
      : null;

    const cardView = state.playing
      ? {
          quarter: state.quarter,
          predictions: state.predictions,
          cues: state.playing.watchFor.filter((cue) => cue.quarter <= state.quarter),
          finished: state.quarter >= state.playing.quarters,
          answerShown: state.cardAnswerShown,
          onRevealAnswer: () => {
            state.cardAnswerShown = true;
            draw();
          },
          onPredict: (variable, answer) => {
            state.predictions = { ...state.predictions, [variable]: answer };
            draw();
          },
          onAdvance: advance,
          onBack: back,
          onReset: reset,
        }
      : null;

    root.replaceChildren(
      el("header", { class: "masthead" }, [
        el("h1", { class: "masthead__title", text: copy.app.title }),
        el("p", { class: "masthead__subtitle", text: copy.app.subtitle }),
        el("p", { class: "masthead__quarter" }, [
          el("span", { class: "masthead__caption", text: copy.labels.quarter }),
          el("span", { class: "masthead__number", text: String(screen.quarter) }),
        ]),
      ]),
      renderNav(),
      state.view === "simulate" ? renderControls() : null,
      state.playing
        ? el("p", { class: "banner banner--card" }, [
            el("strong", { text: `${state.playing.title}. ` }),
            document.createTextNode(state.playing.teacherLine),
          ])
        : null,
      renderBanner(screen.banner),

      state.view === "cards"
        ? el("div", { class: "cardpicker" }, [
            el(
              "div",
              { class: "cardpicker__row" },
              content.experiments.map((card) =>
                el("button", {
                  type: "button",
                  class:
                    "button" + (state.playing?.id === card.id ? " button--primary" : ""),
                  text: card.title,
                  onclick: () => loadCard(card.id),
                }),
              ),
            ),
            state.playing
              ? renderCard(state.playing, cardView, copy, content.variables)
              : el("p", { class: "panel__note", text: "Pick a card to begin." }),
          ])
        : null,

      state.view === "map" ? renderMap(mapTiles, copy, selectLayer) : null,
      state.view === "map" ? renderLayerPanel(layerPanel, copy) : null,

      state.view === "check"
        ? renderExitTicket(
            buildExitTicket(content, {
              answers: state.ticketAnswers,
              revealed: state.ticketRevealed,
            }),
            copy,
            {
              onAnswer: (id, value) => {
                state.ticketAnswers = { ...state.ticketAnswers, [id]: value };
                draw();
              },
              onReveal: (id) => {
                state.ticketRevealed = {
                  ...state.ticketRevealed,
                  [id]: !state.ticketRevealed[id],
                };
                draw();
              },
              onReset: () => {
                state.ticketAnswers = {};
                state.ticketRevealed = {};
                draw();
              },
            },
          )
        : null,

      state.view !== "check" && screen.tiles ? renderTiles(screen.tiles, copy) : null,
      state.view === "simulate" && screen.expectations
        ? renderExpectations(screen.expectations, copy)
        : null,
      state.view !== "cards" && state.view !== "check" && screen.pipeline
        ? renderPipeline(screen.pipeline, copy)
        : null,
      state.view !== "check" && screen.attribution
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
      state.drawerOpen
        ? renderGlossary(
            buildGlossary(content, { query: state.glossaryQuery }),
            copy,
            {
              onClose: () => {
                state.drawerOpen = false;
                draw();
              },
              onSearch: (query) => {
                state.glossaryQuery = query;
                draw();
              },
              onWatch: (variable) => {
                // Send the reader to the thing itself, not another paragraph.
                state.drawerOpen = false;
                state.view = "simulate";
                if (screen.attribution && screen.explainable.includes(variable)) {
                  state.explaining = variable;
                }
                draw();
              },
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

