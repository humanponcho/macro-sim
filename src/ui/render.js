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
