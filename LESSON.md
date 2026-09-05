# Macro-Sim lesson script

One 90-minute class, run from the app, start to finish.

Every figure below is one the model actually prints, at the rounding the app
displays: two decimal places on percentages, one on index numbers. Run the same
cards and you will see the same numbers.

A printable version of this script is published as an artifact. This file is
the source, and it is versioned with the content it quotes.

---

## Before the class

**Start the app.**

```bash
npm start
```

Open `http://localhost:8000` and put the browser in full screen.

**Check three things.**

1. Drag the policy-rate slider. The number beside it counts up as you drag.
2. Click **Advance a quarter**, then press the space bar. It advances again.
3. Click **Start again**. The quarter counter returns to 0.

**Know the four tabs.**

| Tab | What it is |
| --- | --- |
| Simulate | You drive. Set the rate, advance a quarter. |
| Where in the system are we? | The map of ten layers. |
| Shock cards | Four prepared experiments. |
| Exit ticket | Five questions to close. |

---

## 0–8 min · The opening question

Aim: separate the physical economy from the financial economy, before any
screen is shown.

### 1. Ask before you show anything

Keep the projector off.

> If every stock exchange in the world closed tomorrow morning, would the
> economy stop?

Take answers for two minutes. Most classes split.

The answer is no. Farms still grow food. Factories still run. People still work
and ships still sail. Financial markets matter enormously, but they sit on top
of a physical economy that makes things.

### 2. Name the two halves

Write two words on the board: **physical** and **financial**. Ask each student
for one thing from their own week that belongs in each. Typical answers: a bus
ride against a student loan.

> Today we are going to watch something happen on one side, and travel to the
> other.

---

## 8–20 min · The map

Aim: give the class the stack, and be honest about what the model does not do.

### 3. Open the map at quarter zero

Click **Where in the system are we?** Do not advance a quarter yet.

Ten tiles. Read them from the bottom, because the bottom changes slowly and the
top changes daily.

> People and resources make things. Trade moves them. Wages turn making into
> spending. Banks turn leftover income into new factories. Then the central bank
> changes the price of borrowing, and everything above reprices.

### 4. Read the badges out loud

Each tile carries a badge saying how much of that layer the model computes.

| Layer | Badge |
| --- | --- |
| 10 The feedback loop | Partly simulated |
| 9 Asset markets | Simulated |
| 8 The US dollar and government bonds | Simulated |
| 7 Central banks and interest rates | Simulated |
| 6 Savings, credit and investment | Simulated |
| 5 Labour, income and consumption | Partly simulated |
| 4 International trade | Discussed, not simulated |
| 3 Production and supply chains | Discussed, not simulated |
| 2 Energy and natural resources | Partly simulated |
| 1 Demographics and geography | Discussed, not simulated |

Point at layer 3 and read its sentence aloud.

> This machine leaves things out on purpose. When we reach something it cannot
> do, I will say so, and we will talk about it instead.

Say this early and mean it. A student who later asks about house prices or
unemployment must get an honest answer, not an invented slider.

### 5. Set the expectation

> Every tile is quiet, because nothing has happened yet. In a moment I am going
> to change one number, and I want you to watch which tiles wake up first.

---

## 20–48 min · The rate rise

Aim: the lag. Markets move today. The real economy moves over the following
year. **This is the core of the lesson. Do not rush it.**

### 6. Load the card and take the predictions

Open **Shock cards** → **You raise rates, and hold**.

The app will not let you advance until every line of the checklist is answered.
That is deliberate.

> Inflation is on target. Growth is steady. I am going to raise the interest
> rate anyway, by one percentage point, and leave it there for two years. Before
> we start: which of these four will have moved by the end of the first three
> months?

| Line | The model says |
| --- | --- |
| Treasury yield | Will move |
| Equity valuations | Will move |
| Credit conditions | Will **not** move |
| Growth | Will **not** move |

Most classes vote that credit and growth move. Let them. The correction is the
lesson.

### 7. Advance one quarter, then stop talking

Click **Start the card**. Let the class read for ten seconds before you speak.

| Reading | Value | Moved? |
| --- | ---: | --- |
| Policy rate | 4.50 | you set this |
| Treasury yield | 4.36 | up |
| US dollar | 102.1 | up |
| Equity valuations | 94.4 | down |
| Credit conditions | 100.0 | no change |
| Growth | 2.00 | no change |
| Inflation | 2.00 | no change |

The banner says it for you: **Markets have moved. The real economy has not
responded yet.**

Shares fell more than five points. Nobody lost a job. No shop changed a price.

### 8. Open the pipeline. This is the moment

Point at **What is still in the pipeline**.

| Reading | Now | Heading for |
| --- | ---: | ---: |
| Credit conditions | 100.0 | 95.6 |
| Growth | 2.00 | 1.94 |
| Inflation | 2.00 | 1.80 |

**Heading for** means the level a number would reach if today's conditions never
changed again and every delay finished.

> Credit still reads one hundred. It has not moved at all. But it is already
> heading for ninety-five point six. Nothing has happened here yet, and
> something certainly will.

If the class remembers one screen from the whole lesson, make it this one.

### 9. Ask why the shares fell

Scroll to **Why did this move?**

| Cause | Points |
| --- | ---: |
| Discount rate | −3.4 |
| Expected profits | −2.4 |
| Energy costs | +0.2 |
| Credit conditions | 0.0 |

Define two terms.

- **Discount rate** — the return investors demand for waiting. When it rises,
  money you will earn later is worth less today.
- **Expected profits** — not this year's profits. What the market now thinks
  profits will be.

**Ask the class:** credit contributed exactly zero. Why is that not a bug?

*Because credit reads the previous quarter. In the quarter of the decision it
has nothing to say. That zero is the lag, written as a number.*

### 10. Show that the market moved before any figure was published

Point at **What markets expect**.

| Reading | Expected | Printed |
| --- | ---: | ---: |
| Growth | 1.70 | 2.00 |
| Inflation | 1.81 | 2.00 |

> No growth figure has been published. Nothing has been measured. But the market
> has already marked growth down from two to one point seven, and it is trading
> on that. This is why shares can fall on a day when no news arrives.

### 11. Advance to quarter 2. The pipe opens

Press the space bar once.

| Reading | Q1 | Q2 |
| --- | ---: | ---: |
| Credit conditions | 100.0 | 97.8 |
| Growth | 2.00 | 1.98 |
| Inflation | 2.00 | 1.98 |

> Three months after the decision, borrowing is harder. That is the first thing
> in the real world to change. Everything before this was price.

### 12. Run to quarter 6

Press the space bar four more times, pausing a beat on each.

| Quarter | Equity | Credit | Growth | Inflation |
| --- | ---: | ---: | ---: | ---: |
| 1 | 94.4 | 100.0 | 2.00 | 2.00 |
| 2 | 94.1 | 97.8 | 1.98 | 1.98 |
| 3 | 93.1 | 95.5 | 1.91 | 1.93 |
| 4 | 92.2 | 95.4 | 1.78 | 1.89 |
| 5 | 91.9 | 95.2 | 1.66 | 1.84 |
| 6 | 91.7 | 94.9 | 1.60 | 1.80 |

> One decision, in the first three months. A year and a half later growth has
> fallen from two to one point six, and inflation is only now down to one point
> eight. The rate has not changed once since the day we set it.

**Ask the class:** a central banker sees inflation still at 1.98 in quarter 2
and decides the rise did not work. What mistake are they making?

*They are reading the gauge before the machine has finished moving.*

### 13. Go back to the map and watch it light up

Click **Where in the system are we?** without resetting.

Layers 7, 8 and 9 say *moved this quarter*. Layers 1, 3 and 4 say *quiet*, and
always will, because the model never computes them.

---

## 48–65 min · The energy shock

Aim: the same fall in shares, for a completely different reason.

### 14. Load the second card

**Shock cards** → **Energy supply is cut**. Answer the checklist, advance one
quarter. This time the rate does not move.

| Reading | Value | Moved? |
| --- | ---: | --- |
| Energy | 109.8 | up sharply |
| Equity valuations | 95.3 | down |
| Treasury yield | 3.90 | up a little |
| Policy rate | 3.50 | no change |
| Inflation | 2.00 | no change |

Inflation still reads exactly 2.00, in the quarter energy jumped ten points.

### 15. Compare the two attribution panels

| Cause | Rate rise | Energy shock |
| --- | ---: | ---: |
| Discount rate | −3.4 | −0.6 |
| Expected profits | −2.4 | −2.0 |
| Energy costs | +0.2 | −2.1 |
| Credit conditions | 0.0 | 0.0 |
| **Total** | **−5.6** | **−4.7** |

> Both times the shares fell. The first time the borrowing cost did the damage.
> The second time the fuel bill did. Same headline. Different machine. Different
> cure.

This is the single most useful habit in the lesson. When something moves, do not
ask whether it is good or bad. Ask what caused it.

### 16. Run to quarter 6 and name what you are looking at

| Quarter | Energy | Inflation | Growth |
| --- | ---: | ---: | ---: |
| 1 | 109.8 | 2.00 | 2.00 |
| 2 | 109.8 | 2.24 | 1.86 |
| 3 | 109.5 | 2.60 | 1.72 |
| 4 | 109.0 | 2.77 | 1.58 |
| 5 | 108.5 | 2.82 | 1.56 |
| 6 | 108.1 | 2.79 | 1.55 |

> Prices are rising faster and the economy is producing less, at the same time.
> That combination has a name. It is stagflation, and it is the hardest thing a
> central bank ever faces.

---

## 65–78 min · Give the rate to a rule

Aim: show that responding has a price, and who pays it.

### 17. Run the same shock with the bank reacting

**Shock cards** → **The same shock, with the bank on a rule**. Advance six
quarters.

| Quarter | 1 | 2 | 3 | 4 | 6 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Policy rate | 3.92 | 3.73 | 3.89 | 3.97 | 3.93 |

**Ask the class:** in quarter 2 inflation printed higher for the first time, and
the bank cut. Is that a mistake?

*No, it is arithmetic. The rule reads what it expects, and its expectations
already contain the rise it made last quarter. Its own first move argues part of
itself away.*

### 18. Put the price of the response on the board

| Reading | Did nothing | On a rule | Difference |
| --- | ---: | ---: | ---: |
| Inflation | 2.79 | 2.71 | −0.08 |
| Growth | 1.55 | 1.40 | −0.15 |
| Equity valuations | 93.0 | 89.5 | −3.5 |

> The rule shaved eight hundredths off inflation. It cost fifteen hundredths of
> growth and three and a half points off everyone's savings. Was that a good
> trade? That is not an economics question with a right answer. It is a
> political one, and adults argue about it constantly.

**Ask the class:** the shortage was physical. Can an interest rate produce more
energy?

*No. It can only reduce how much people can afford to buy.*

---

## 78–90 min · Close

### 19. Run the exit ticket together

Click the **Exit ticket** tab. Read each question aloud and take a vote before
you click.

| Question | Answer |
| --- | --- |
| Which has already moved in the quarter of a rate rise? | Equity valuations |
| Yields rise. What happens to a bond someone already holds? | Its price falls |
| A drought ruins a grain harvest. Which layer? | 2, energy and resources |
| Unemployment jumps. Which layer is its home? | 5, labour and income |
| Why does a rate rise not slow growth immediately? | Open — read it aloud |

Question four is worth pausing on. Layer 5 is the right home even though the
model does not compute jobs at all. The tile says so on its face.

### 20. Leave them with the four questions

Write these on the board and leave them up.

1. What changed?
2. Why did it change?
3. Was it already expected?
4. What does it do to the other layers?

> You will not leave here able to forecast the economy. Nobody can. What you have
> now is a map. When the next headline arrives, you can say: that started in
> energy, or in the labour market, or at the central bank — and here are the two
> doors it will walk through next.

Closing line, if you want one: the physical economy is what we eat, drive, build
and nurse. The financial economy is how we price the future of those things.
Learn the pipes between them, and the news stops being noise.
