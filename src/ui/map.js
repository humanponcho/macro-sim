/**
 * The layer map.
 *
 * The map is a legend for the engine, not a second engine. It never changes an
 * input: selecting a layer selects it, and nothing else. Cards move the rate.
 * The map does not.
 *
 * Everything here is pure and reads the mapping out of layers.json, so which
 * variable belongs to which layer is a content decision. Changing it means
 * editing one JSON file, never this module.
 *
 * A layer may reference three kinds of engine id:
 *   variable   one of the ten readouts
 *   link       one of the 31 links, for a layer whose story is a channel
 *              rather than a level, such as the wealth effect
 *   input      energySupplyGap, which is set rather than computed
 */

import { formatValue } from "../display/format.js";
import { BASELINE } from "../engine/coefficients.js";
import { TARGET_VARIABLES } from "../engine/engine.js";

export const ENGINE_INPUTS = ["energySupplyGap"];

/** Every engine id a layer claims, whatever kind it is. */
export function layerRefs(layer) {
  return [...(layer.engineVariables ?? []), ...(layer.engineLinks ?? [])];
}

/** What kind of thing an id names, or null when it names nothing. */
export function resolveRef(ref, content) {
  if (content.variables[ref]) return { kind: "variable", id: ref };
  if (content.links[ref]) return { kind: "link", id: ref };
  if (ENGINE_INPUTS.includes(ref)) return { kind: "input", id: ref };
  return null;
}

/**
 * Check the map against the engine. Returns a list of problems, empty when the
 * mapping is sound. A layer that claims an id nothing answers to would render a
 * blank tile, so this is checked rather than trusted.
 */
export function validateLayerRefs(layers, content) {
  const problems = [];

  for (const layer of layers) {
    const refs = layerRefs(layer);

    for (const ref of refs) {
      if (!resolveRef(ref, content)) {
        problems.push(`L${layer.number} claims unknown engine id "${ref}"`);
      }
    }

    if (layer.mode === "discussed" && refs.length > 0) {
      problems.push(`L${layer.number} is spoken but claims ${refs.length} engine id(s)`);
    }

    if (layer.mode !== "simulated" && (layer.notSimulated ?? []).length === 0) {
      problems.push(`L${layer.number} is not fully simulated but names nothing it omits`);
    }
  }

  return problems;
}

/** Did this id change between the two quarters, as printed? */
function refMoved(ref, snapshot, previous, content) {
  const resolved = resolveRef(ref, content);
  if (!resolved) return false;

  if (resolved.kind === "input") {
    const before = previous ? previous[ref] : 0;
    return snapshot[ref] !== before;
  }

  if (resolved.kind === "variable") {
    const before = previous ? previous[ref] : BASELINE[ref] ?? snapshot[ref];
    return formatValue(ref, snapshot[ref]) !== formatValue(ref, before);
  }

  // A link moved when the size of its contribution changed, as printed.
  for (const [variable, terms] of Object.entries(snapshot.contributions)) {
    if (terms[ref] === undefined) continue;
    const before = previous?.contributions?.[variable]?.[ref] ?? 0;
    return formatValue(variable, terms[ref]) !== formatValue(variable, before);
  }

  return false;
}

/** Is any delayed variable in this layer still travelling, as printed? */
function layerInFlight(layer, snapshot) {
  return layerRefs(layer)
    .filter((ref) => TARGET_VARIABLES.includes(ref))
    .some((ref) => formatValue(ref, snapshot[ref]) !== formatValue(ref, snapshot.target[ref]));
}

/**
 * One of three states, and only one.
 *
 * quiet        nothing here changed and nothing is on its way
 * moving       something here changed this quarter
 * inFlight     nothing changed, but something is still travelling
 *
 * The order matters for teaching. In the quarter of a rate rise, credit shows
 * "in flight" precisely because it did not move: the lag is the lesson.
 */
export function layerActivity(layer, snapshot, previous, content) {
  if (!snapshot) return "quiet";
  if (layerRefs(layer).some((ref) => refMoved(ref, snapshot, previous, content))) return "moving";
  if (layerInFlight(layer, snapshot)) return "inFlight";
  return "quiet";
}

/** Which of a layer's variables the attribution panel can actually explain. */
export function explainableIn(layer, snapshot) {
  if (!snapshot) return [];
  return (layer.engineVariables ?? []).filter((id) => snapshot.contributions[id]);
}

/**
 * The ten tiles.
 *
 * `selectable` says whether clicking opens an attribution panel. The policy
 * rate is an input, so layer 7 is a tile you can read but not explain: there is
 * no equation behind it to break apart.
 */
export function buildMap(content, snapshot = null, previous = null, selected = null) {
  return content.layers.map((layer) => {
    const refs = layerRefs(layer);
    const explainable = explainableIn(layer, snapshot);

    return {
      number: layer.number,
      title: layer.title,
      mode: layer.mode,
      badge: content.copy.labels[
        layer.mode === "simulated" ? "simulated" : layer.mode === "partial" ? "partial" : "discussed"
      ],
      activity: layerActivity(layer, snapshot, previous, content),
      refs,
      variables: layer.engineVariables ?? [],
      explainable,
      selectable: explainable.length > 0,
      selected: selected === layer.number,
      // A layer that leaves something out must say so on its face, so a
      // student never mistakes silence for "the model handled it".
      notSimulated: layer.notSimulated ?? [],
      // The badge comes from mode; the omission sentence comes from what the
      // layer actually leaves out. They are separate questions. Layer 9 is
      // simulated and still owes the class a word about housing and gold.
      omission: omissionSentence(layer, content),
      plain: layer.plain,
      analogy: layer.analogy,
      watch: layer.watch,
      discuss: layer.discuss,
      engineNote: layer.engineNote ?? null,
    };
  });
}

/** The sentence a spoken or partial layer shows on its tile. */
export function omissionSentence(layer, content) {
  const omitted = layer.notSimulated ?? [];
  if (omitted.length === 0) return null;

  const list =
    omitted.length === 1
      ? omitted[0]
      : `${omitted.slice(0, -1).join(", ")} and ${omitted[omitted.length - 1]}`;

  return `${content.copy.explanations.notSimulated} Not simulated here: ${list}.`;
}

/** The panel for a selected layer. */
export function buildLayerPanel(content, number, snapshot) {
  const layer = content.layers.find((l) => l.number === number);
  if (!layer) return null;

  return {
    number: layer.number,
    title: layer.title,
    mode: layer.mode,
    plain: layer.plain,
    analogy: layer.analogy,
    watch: layer.watch,
    discuss: layer.discuss,
    engineNote: layer.engineNote ?? null,
    omission: omissionSentence(layer, content),
    explainable: explainableIn(layer, snapshot),
    variableLabels: (layer.engineVariables ?? []).map((id) => ({
      id,
      label: content.variables[id].label,
      explainable: Boolean(snapshot?.contributions?.[id]),
    })),
  };
}
