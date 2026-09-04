/**
 * The study aids: the glossary drawer and the exit ticket.
 *
 * Pure, like every other decision-making module. The drawer resolves its own
 * cross-references and tells the screen which terms can be watched live, so a
 * student reading "yield" can be sent to the tile that shows it moving.
 *
 * The exit ticket marks answers but never withholds the reason. A wrong answer
 * that is simply marked wrong teaches nothing.
 */

const normalise = (text) => String(text).toLowerCase().trim();

/**
 * The glossary, filtered and cross-referenced.
 *
 * A term that names an engine readout is flagged, so the drawer can offer to
 * show it on screen rather than only describe it.
 */
export function buildGlossary(content, { query = "", selected = null } = {}) {
  const needle = normalise(query);

  const entries = Object.entries(content.glossary)
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, entry]) => {
      const variable = entry.variable && content.variables[entry.variable];

      return {
        key,
        term: entry.term,
        plain: entry.plain,
        variable: entry.variable ?? null,
        variableLabel: variable ? variable.label : null,
        onScreen: Boolean(variable),
        selected: key === selected,
        seeAlso: (entry.seeAlso ?? [])
          .filter((other) => content.glossary[other])
          .map((other) => ({ key: other, term: content.glossary[other].term })),
      };
    })
    .sort((a, b) => a.term.localeCompare(b.term));

  const matches = needle
    ? entries.filter(
        (entry) =>
          normalise(entry.term).includes(needle) || normalise(entry.plain).includes(needle),
      )
    : entries;

  return { entries: matches, total: entries.length, query, empty: matches.length === 0 };
}

/** Any cross-reference that points at a term the glossary does not have. */
export function danglingReferences(content) {
  const problems = [];

  for (const [key, entry] of Object.entries(content.glossary)) {
    if (key.startsWith("_")) continue;
    for (const other of entry.seeAlso ?? []) {
      if (!content.glossary[other]) problems.push(`${key} points at missing "${other}"`);
    }
    if (entry.variable && !content.variables[entry.variable]) {
      problems.push(`${key} points at unknown variable "${entry.variable}"`);
    }
  }

  return problems;
}

/** The options a question offers, as things a reader can actually pick. */
function optionsFor(question, content) {
  if (question.kind === "variable") {
    return question.options.map((id) => ({
      value: id,
      label: content.variables[id].label,
    }));
  }

  if (question.kind === "layer") {
    return content.layers.map((layer) => ({
      value: layer.number,
      label: `${layer.number}. ${layer.title}`,
    }));
  }

  if (question.kind === "choice") {
    return question.options.map((option) => ({ value: option, label: option }));
  }

  return [];
}

/**
 * The exit ticket.
 *
 * `open` questions have no options and are never marked right or wrong: they
 * are for a teacher to read aloud. Everything else is marked as soon as it is
 * answered, and the reason is shown either way.
 */
export function buildExitTicket(content, { answers = {}, revealed = {} } = {}) {
  const ticket = content.copy.exitTicket;

  const questions = ticket.questions.map((question) => {
    const given = answers[question.id];
    const answered = given !== undefined;
    const markable = question.kind !== "open";
    const correct = markable && answered ? given === question.answer : null;

    return {
      id: question.id,
      ask: question.ask,
      kind: question.kind,
      options: optionsFor(question, content),
      given: given ?? null,
      answered,
      markable,
      correct,
      // An open question shows its model answer on request. A markable one
      // reveals as soon as it is answered: hiding it would teach nothing.
      revealed: markable ? answered : Boolean(revealed[question.id]),
      answer: question.answer,
      answerLabel: labelForAnswer(question, content),
      because: question.because,
    };
  });

  const marked = questions.filter((q) => q.markable);

  return {
    title: ticket.title,
    prompt: ticket.prompt,
    closing: ticket.closing,
    questions,
    answered: questions.filter((q) => q.answered).length,
    total: questions.length,
    right: marked.filter((q) => q.correct === true).length,
    markable: marked.length,
    complete: questions.every((q) => q.answered || !q.markable),
  };
}

/** The answer as a reader would see it, not as an id. */
export function labelForAnswer(question, content) {
  if (question.kind === "variable") return content.variables[question.answer].label;
  if (question.kind === "layer") {
    const layer = content.layers.find((l) => l.number === question.answer);
    return layer ? `${layer.number}. ${layer.title}` : String(question.answer);
  }
  return String(question.answer);
}

/**
 * Check the ticket against the engine and the map. Returns a list of problems,
 * empty when every question is answerable and its answer is among its options.
 */
export function validateExitTicket(content) {
  const problems = [];
  const ticket = content.copy.exitTicket;

  for (const question of ticket.questions ?? []) {
    if (!question.ask) problems.push(`${question.id} asks nothing`);
    if (question.answer === undefined) problems.push(`${question.id} has no answer`);
    if (!question.because) problems.push(`${question.id} gives no reason`);

    if (question.kind === "variable") {
      for (const id of question.options ?? []) {
        if (!content.variables[id]) problems.push(`${question.id} offers unknown variable "${id}"`);
      }
      if (!(question.options ?? []).includes(question.answer)) {
        problems.push(`${question.id}: the answer is not among its options`);
      }
    }

    if (question.kind === "choice" && !(question.options ?? []).includes(question.answer)) {
      problems.push(`${question.id}: the answer is not among its options`);
    }

    if (question.kind === "layer") {
      const layer = content.layers.find((l) => l.number === question.answer);
      if (!layer) problems.push(`${question.id} answers with unknown layer ${question.answer}`);
    }

    if (!["variable", "choice", "layer", "open"].includes(question.kind)) {
      problems.push(`${question.id} has unknown kind "${question.kind}"`);
    }
  }

  return problems;
}
