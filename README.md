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

Phases 1 and 2 of the build plan are complete: the engine is ported, tested, and
now reports why each variable moved and where the delayed ones are heading.
There is no user interface yet, by design. The snapshot contract is frozen, so
lesson content can safely be written against it.

| Phase | What | State |
| ----- | ---- | ----- |
| 0 | Project setup, lesson content extracted from the source documents | Partly done. Setup is in place. Lesson text waits for the frozen snapshot, which now exists. |
| 1 | Engine port, golden tests, acceptance tests T0–T10, `NaN` guard | **Done** |
| 2 | Target values, per-link contributions, replay-based step back | **Done** |
| 3 | The Simulate screen | Not started |
| 4 | The layer map and shock cards | Not started |
| 5 | Activities, assessment, teacher mode | Not started |

## Running the tests

No dependencies to install. Node 18 or newer.

```bash
npm test
```

That runs four suites:

- **Golden files.** Replays five scenarios through the JavaScript engine and
  compares every number with the Python reference calculator, to `1e-9`.
- **Acceptance.** The eleven behavioural tests from section 11 of the
  specification, plus bounds and immutability checks.
- **Attribution.** Proves the contributions add up to the current for every
  variable in every quarter of every scenario, checks the targets against the
  spec formulas written out with literals, and checks that stepping back
  reproduces an independent shorter run.
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
  engine.attribution.test.js   Targets, contributions and step back.
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

## What a snapshot carries

Each quarter produces one snapshot. The eight currents are the levels. The rest
exists so a screen can explain them.

```js
{
  quarter: 1,

  // the eight currents, plus expectations and the inputs that produced them
  growth: 2, inflation: 2, policyRate: 4.5, treasuryYield: 4.362,
  dollar: 102.14, credit: 100, energy: 99.251, equity: 94.393,
  gExp: 1.7, piExp: 1.805,
  energySupplyGap: 0, policyMode: "manual",

  // where the delayed variables are heading
  target: { credit: 95.57, growth: 1.94, inflation: 1.80, energy: 99.25 },

  // why each variable is where it is
  contributions: {
    equity: { y_to_eq: -3.372, gexp_to_eq: -2.4, cred_to_eq: 0, e_to_eq: 0.165 },
    // ...and the same for treasuryYield, dollar, credit, growth,
    //    inflation, energy, gExp and piExp
  }
}
```

### Contributions

Every equation in the model is linear, so each level splits **exactly** into one
contribution per link. There is no approximation and nothing to recompute:

```js
BASELINE[variable] + sum(snapshot.contributions[variable]) === snapshot[variable]
```

So "why did equity move?" is `Object.entries(snapshot.contributions.equity)`.
In the quarter of a rate rise, the answer reads: the discount rate took 3.37
points, weaker growth expectations took 2.40 more, cheaper energy gave back
0.16, and **credit contributed nothing at all** — because the credit link has a
lag of one quarter. That single zero is the whole lesson about lags.

One caveat: the contributions describe the equation *before* clipping. If a
bound binds, the sum reports the level the equation asked for, not the clipped
current.

### Targets

A target is the level a delayed variable would reach if today's drivers never
moved again and every lag had fully landed. It is the same equation with lag 0
and width 1, read off this tick's currents.

Only the four delayed variables have one. The markets are already at their level
equation, so a target would just repeat the current.

The distance between current and target is what a lag looks like on screen. In
the quarter of a rate rise, credit still reads 100 while its target is already
95.6. Nothing has happened yet, and something certainly will. Hold the same rate
for eight quarters and the two meet: 94.65 against 94.63.

Targets are not clipped to the bounds. Clamp them for display if you draw a
meter.

### Stepping back

Stepping back replays the tape. It never inverts the arithmetic, and it adds no
state:

```js
stepBack(tape, currentQuarter)  // === runTape(tape, { quarters: currentQuarter - 1 })
```

The tape is the source of truth. The history arrays stay an implementation
detail inside `simulateQuarter`.

## Source documents

The specification, the two lesson packs and the masterclass PDF are excluded
from this repository by `.gitignore`, because the repository is public and they
are the author's own teaching materials. Remove the last two lines of
`.gitignore` to publish them alongside the code.

`macrosim_model_v1.json` and `macrosim_engine_v1.py` are tracked, because the
build depends on both: the first is loaded as the coefficient table, and the
second is the oracle the tests compare against.
