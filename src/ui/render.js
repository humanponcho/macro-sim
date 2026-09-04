/**
 * The DOM layer. Deliberately dumb: it walks the structures from viewmodel.js
 * and writes elements. It makes no decisions, so nothing here needs a test.
 */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false || value === null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }

  return node;
}

const sign = (direction) => (direction > 0 ? "up" : direction < 0 ? "down" : "flat");

export function renderBanner(banner) {
  if (!banner) return null;
  return el("p", { class: `banner banner--${banner.kind}`, role: "status", text: banner.text });
}

export function renderTiles(tiles, copy) {
  return el("section", { class: "panel" }, [
    el("h2", { class: "panel__title", text: copy.panels.currents }),
    el(
      "div",
      { class: "tiles" },
      tiles.map((tile) =>
        el("article", { class: `tile tile--${sign(tile.direction)}`, title: tile.plain }, [
          el("h3", { class: "tile__label", text: tile.label }),
          el("p", { class: "tile__value", text: tile.value }),
          el("p", {
            class: "tile__change",
            text: tile.moved ? tile.change : copy.labels.noChange,
          }),
          tile.role === "input" ? el("span", { class: "tile__flag", text: "you set this" }) : null,
        ]),
      ),
    ),
  ]);
}

export function renderExpectations(rows, copy) {
  return el("section", { class: "panel" }, [
    el("h2", { class: "panel__title", text: copy.panels.expectations }),
    el("p", { class: "panel__note", text: copy.explanations.expectationsLead }),
    el(
      "div",
      { class: "expectations" },
      rows.map((row) =>
        el("article", { class: `expect ${row.diverged ? "expect--diverged" : ""}` }, [
          el("h3", { class: "expect__label", text: row.printedLabel }),
          el("div", { class: "expect__pair" }, [
            el("div", { class: "expect__cell" }, [
              el("span", { class: "expect__caption", text: copy.labels.expected }),
              el("span", { class: "expect__number", text: row.expected }),
            ]),
            el("div", { class: "expect__cell" }, [
              el("span", { class: "expect__caption", text: copy.labels.printed }),
              el("span", { class: "expect__number", text: row.printedValue }),
            ]),
          ]),
        ]),
      ),
    ),
  ]);
}

export function renderPipeline(rows, copy) {
  return el("section", { class: "panel" }, [
    el("h2", { class: "panel__title", text: copy.panels.pipeline }),
    el("p", { class: "panel__note", text: copy.explanations.target }),
    el(
      "div",
      { class: "pipeline" },
      rows.map((row) =>
        el("article", { class: `meter ${row.inFlight ? "meter--moving" : "meter--settled"}` }, [
          el("h3", { class: "meter__label", text: row.label }),
          el("div", { class: "meter__numbers" }, [
            el("span", { class: "meter__now" }, [
              el("span", { class: "meter__caption", text: copy.labels.current }),
              el("span", { class: "meter__value", text: row.current }),
            ]),
            el("span", { class: "meter__arrow", text: row.inFlight ? "→" : "" }),
            el("span", { class: "meter__target" }, [
              el("span", { class: "meter__caption", text: copy.labels.target }),
              el("span", { class: "meter__value", text: row.target }),
            ]),
          ]),
          el("div", {
            class: "meter__track",
            role: "img",
            "aria-label": `${Math.round(row.progress * 100)} percent of the way to ${row.target}`,
          }, [
            el("div", { class: "meter__fill", style: `width:${(row.progress * 100).toFixed(1)}%` }),
          ]),
          row.offScale ? el("p", { class: "meter__flag", text: copy.banners.offScaleTarget }) : null,
        ]),
      ),
    ),
  ]);
}

export function renderAttribution(panel, explainable, copy, variables, onSelect) {
  return el("section", { class: "panel" }, [
    el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: copy.panels.attribution }),
      el(
        "select",
        {
          class: "picker",
          "aria-label": copy.actions.explain,
          onchange: (event) => onSelect(event.target.value),
        },
        explainable.map((id) =>
          el("option", {
            value: id,
            text: variables[id].label,
            selected: id === panel.variable,
          }),
        ),
      ),
    ]),
    el("p", { class: "panel__lead" }, [
      el("strong", { text: panel.label }),
      document.createTextNode(` is ${panel.value}, from a start of ${panel.baseline}. `),
      el("span", { class: "panel__net", text: `Net ${panel.net}.` }),
    ]),
    el(
      "ol",
      { class: "bars" },
      panel.terms.map((term) =>
        el("li", { class: `bar bar--${sign(term.direction)}`, title: term.plain }, [
          el("span", { class: "bar__label", text: term.label }),
          el("span", { class: "bar__track" }, [
            el("span", { class: "bar__zero" }),
            el("span", {
              class: "bar__fill",
              style: `width:${(term.weight * 50).toFixed(2)}%`,
            }),
          ]),
          el("span", { class: "bar__value", text: term.value }),
        ]),
      ),
    ),
    panel.terms.some((term) => term.isZero)
      ? el("p", { class: "panel__note", text: copy.explanations.zeroContribution })
      : null,
  ]);
}

/* --- phase 4: the layer map and the cards --- */

export function renderMap(tiles, copy, onSelect) {
  return el("section", { class: "panel" }, [
    el("h2", { class: "panel__title", text: copy.panels.map }),
    el(
      "ol",
      { class: "map" },
      // Read from the bottom up: layer 1 is the foundation.
      [...tiles].reverse().map((tile) =>
        el(
          "li",
          {
            class:
              `layer layer--${tile.mode} layer--${tile.activity}` +
              (tile.selected ? " layer--selected" : ""),
          },
          [
            el(
              tile.selectable ? "button" : "div",
              {
                class: "layer__button",
                type: tile.selectable ? "button" : undefined,
                "aria-pressed": tile.selectable ? String(tile.selected) : undefined,
                onclick: tile.selectable ? () => onSelect(tile.number) : undefined,
              },
              [
                el("span", { class: "layer__number", text: String(tile.number) }),
                el("span", { class: "layer__body" }, [
                  el("span", { class: "layer__title", text: tile.title }),
                  el("span", { class: "layer__meta" }, [
                    el("span", { class: "layer__badge", text: tile.badge }),
                    el("span", {
                      class: "layer__activity",
                      text:
                        tile.activity === "moving"
                          ? "moved this quarter"
                          : tile.activity === "inFlight"
                            ? "in flight"
                            : "quiet",
                    }),
                  ]),
                  tile.omission ? el("span", { class: "layer__omission", text: tile.omission }) : null,
                ]),
              ],
            ),
          ],
        ),
      ),
    ),
  ]);
}

export function renderLayerPanel(panel, copy) {
  if (!panel) return null;

  return el("section", { class: "panel panel--layer" }, [
    el("h2", { class: "panel__title", text: `${panel.number}. ${panel.title}` }),
    el("p", { class: "panel__lead", text: panel.plain }),
    panel.analogy ? el("p", { class: "panel__note", text: panel.analogy }) : null,
    panel.engineNote ? el("p", { class: "panel__engine", text: panel.engineNote }) : null,
    panel.omission ? el("p", { class: "panel__omission", text: panel.omission }) : null,
    panel.watch ? el("p", { class: "panel__note" }, [
      el("strong", { text: "Watch: " }),
      document.createTextNode(panel.watch),
    ]) : null,
    panel.discuss ? el("p", { class: "panel__note" }, [
      el("strong", { text: "Discuss: " }),
      document.createTextNode(panel.discuss),
    ]) : null,
    panel.variableLabels.length
      ? el("ul", { class: "layer__vars" },
          panel.variableLabels.map((v) =>
            el("li", { class: v.explainable ? "layer__var" : "layer__var layer__var--input" }, [
              el("span", { text: v.label }),
              v.explainable ? null : el("span", { class: "layer__varflag", text: "you set this" }),
            ]),
          ))
      : null,
  ]);
}

export function renderCard(card, view, copy, variables) {
  const answered = Object.keys(view.predictions ?? {}).length;
  const ready = answered >= card.predict.length;

  return el("section", { class: "panel panel--card" }, [
    el("h2", { class: "panel__title", text: card.title }),
    el("p", { class: "card__subtitle", text: card.subtitle }),
    el("p", { class: "panel__lead", text: card.setup }),

    el("div", { class: "predict" }, [
      el("h3", { class: "predict__prompt", text: card.predictPrompt }),
      el(
        "ol",
        { class: "predict__list" },
        card.predict.map((item) => {
          const chosen = view.predictions?.[item.variable];
          const correct = chosen === item.answer;

          return el("li", { class: "predict__row" }, [
            el("span", { class: "predict__label", text: variables[item.variable].label }),
            el("span", { class: "predict__choices" }, [
              ...["moves", "still"].map((option) =>
                el("button", {
                  type: "button",
                  class:
                    "predict__choice" +
                    (chosen === option ? " predict__choice--chosen" : ""),
                  text: option === "moves" ? "Will move" : "Will not move",
                  onclick: () => view.onPredict(item.variable, option),
                }),
              ),
            ]),
            chosen
              ? el("span", {
                  class: `predict__mark predict__mark--${correct ? "right" : "wrong"}`,
                  text: correct ? "yes" : "no",
                })
              : null,
            chosen ? el("span", { class: "predict__because", text: item.because }) : null,
          ]);
        }),
      ),
      ready
        ? null
        : el("p", { class: "predict__gate", text: "Answer every line before you advance." }),
    ]),

    el("p", { class: "card__teacher" }, [
      el("strong", { text: "Before you start: " }),
      document.createTextNode(card.teacherLine),
    ]),

    el("div", { class: "actions" }, [
      el("button", {
        class: "button button--primary",
        text: view.quarter === 0 ? "Start the card" : copy.actions.advance,
        disabled: !ready,
        onclick: view.onAdvance,
      }),
      el("button", { class: "button", text: copy.actions.back, disabled: view.quarter === 0, onclick: view.onBack }),
      el("button", { class: "button", text: copy.actions.reset, onclick: view.onReset }),
    ]),

    view.cues.length
      ? el("div", { class: "cues" }, [
          el("h3", { class: "cues__title", text: "What the class should see" }),
          el(
            "ol",
            { class: "cues__list" },
            view.cues.map((cue) =>
              el("li", { class: "cue" }, [
                el("span", { class: "cue__quarter", text: `Q${cue.quarter}` }),
                el("span", { class: "cue__say", text: cue.say }),
              ]),
            ),
          ),
        ])
      : null,

    view.finished && card.askTheClass
      ? el("div", { class: "cues" }, [
          el("h3", { class: "cues__title", text: "Ask the class" }),
          el("p", { class: "panel__lead", text: card.askTheClass }),
          el("p", { class: "panel__note", text: card.answer }),
        ])
      : null,
  ]);
}
