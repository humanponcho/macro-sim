# Macro-Sim

An interactive lesson on how the global economy fits together, built around a
small quarterly simulation engine.

The lesson teaches a ten-layer model: demographics and geography at the bottom,
then energy, production, trade, income, credit, central banks, the dollar and
bonds, asset markets, and a feedback loop back into spending. The engine lets a
class push two of those layers and watch the effect travel, one quarter at a
time.

**This is a teaching model, not a forecast.** The coefficients are chosen to
make transmission visible over six to eight quarters. They are not econometric
estimates, and the model deliberately leaves out fiscal policy, employment,
separate countries, property and gold.

## Status

Phase 1 of the build plan is complete: the engine is ported and tested. There is
no user interface yet, by design. The specification requires the acceptance
tests to pass before any screen is built.

| Phase | What | State |
| ----- | ---- | ----- |
| 0 | Project setup, lesson content extracted from the source documents | Partly done. Setup is in place; the lesson text is not extracted yet. |
| 1 | Engine port, golden tests, acceptance tests T0–T10, `NaN` guard | **Done** |
| 2 | Target values, per-link contributions, replay-based step back | Not started |
| 3 | The Simulate screen | Not started |
| 4 | The layer map and shock cards | Not started |
| 5 | Activities, assessment, teacher mode | Not started |

## Running the tests

No dependencies to install. Node 18 or newer.

```bash
npm test
```

That runs three suites:

- **Golden files.** Replays five scenarios through the JavaScript engine and
  compares every number with the Python reference calculator, to `1e-9`.
- **Acceptance.** The eleven behavioural tests from section 11 of the
  specification, plus bounds and immutability checks.
- **Coefficients.** Asserts that every beta, sign, lag and width in the code
  still matches `macrosim_model_v1.json`.

To regenerate the golden files after a deliberate change to the reference
calculator:

```bash
npm run golden
```

## Layout

```
src/engine/
  coefficients.js   All 31 links, baseline, bounds, the Taylor rule.
  engine.js         simulateQuarter(), pure and deterministic.

test/
  engine.golden.test.js        JavaScript against the Python oracle.
  engine.acceptance.test.js    T0-T10 from the specification.
  model.coefficients.test.js   Guards against coefficient drift.
  golden/scenarios.json        Scenario tapes, shared by both languages.
  golden/*.csv                 Generated. Do not edit by hand.

tools/
  generate_golden.py           Drives the oracle, writes the CSVs.

macrosim_engine_v1.py          The oracle. Reference only, not shipped.
macrosim_model_v1.json         The coefficient table. Source of truth.
```

## How the engine works

One tick is one quarter. `simulateQuarter(state, inputs)` is pure: the same
state with the same inputs always gives the same next state. It never modifies
the state you pass it.

```js
import { runTape } from "./src/engine/engine.js";

// A +1 percentage point rate rise in Q1, held for eight quarters.
const path = runTape([{ quarter: 1, policyRate: 4.5 }], { quarters: 8 });

console.log(path[0].equity);   // 94.39 - markets have already moved
console.log(path[0].growth);   // 2.00  - the real economy has not
console.log(path[0].credit);   // 100   - the credit lag is one quarter
```

A scenario is a starting state plus an ordered list of `{ quarter, policyRate?,
energySupplyGap? }`. An entry applies at the start of its quarter and then
persists, so a held shock needs one entry. **Stepping back a quarter means
replaying the tape from quarter zero, never inverting the arithmetic.**

### Two inputs, eight outputs

Students set the policy rate and an energy supply shock. Everything else is an
output: the Treasury yield, the dollar, credit, energy, equity, growth and
inflation.

The order inside a tick is fixed, and it carries the whole lesson:

1. Apply the inputs.
2. Compute growth and inflation **expectations**.
3. Optionally let the Taylor rule set the rate, then reprice expectations.
4. Treasury yield and the dollar — same quarter as the shock.
5. Energy, then credit, then growth, then inflation — each on its own lag.
6. Equity last, so the shock quarter already contains the full financial hit.
7. Clip every value, append the gaps to history, take a snapshot.

The point of the lag structure is that a rate rise moves markets immediately and
the real economy only later. There is deliberately **no direct policy-rate term
in the growth equation**. Rates reach growth through credit, energy and wealth,
which is what the lesson says out loud.

## Source documents

The specification, the two lesson packs and the masterclass PDF are excluded
from this repository by `.gitignore`, because the repository is public and they
are the author's own teaching materials. Remove the last two lines of
`.gitignore` to publish them alongside the code.

`macrosim_model_v1.json` and `macrosim_engine_v1.py` are tracked, because the
build depends on both: the first is loaded as the coefficient table, and the
second is the oracle the tests compare against.
