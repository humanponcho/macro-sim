# Before a class

Everything in this repository is verified by `npm test` against a document stub
in Node. That proves the logic and the content. **It proves nothing about
layout, focus, pointer behaviour, or how any of this looks on a projector.**

Walk this list on the real page before the app meets a room.

```bash
npm start
```

Then open http://localhost:8000.

## Most likely to fail

**The sliders.** Drag the policy rate from 3.50 to 5.00 in one movement. The
thumb should follow the pointer the whole way and the number beside it should
count up as you go. If it jumps once and stops, the redraw is destroying the
input under the pointer again. That is the failure this file exists to catch;
see the comment in `slider()` in `src/ui/app.js`.

**Keyboard focus.** After clicking Advance, press Space. It should advance
again. Then click into the policy-rate slider and press Space: it must **not**
advance, because a control has focus.

## The hike card

Load **You raise rates, and hold** from the Shock cards tab.

- [ ] Advance is disabled until every line of the prediction checklist is answered.
- [ ] A wrong prediction is marked wrong and still shows its reason.
- [ ] Q1: equity has moved, credit still reads 100.0, its target reads 95.6.
- [ ] Q1: the banner reads *"Markets have moved. The real economy has not responded yet."*
- [ ] Q1: in the attribution panel, `Credit conditions` is last and reads `0.0`, with no minus sign.
- [ ] Advancing does not rewrite the card: the policy rate stays 4.50 throughout.
- [ ] Touch a slider mid-card: playing ends, the quarters already seen are kept, the rest of the card is dropped.
- [ ] After the last quarter, *Ask the class* is visible and the answer is behind a reveal.

## The map

- [ ] L3 Production and L4 Trade are marked discussed, are not buttons, and offer no controls.
- [ ] L5 carries growth and inflation, and its tile says employment and wages are not simulated.
- [ ] L7 Central bank is not a button. The policy rate is an input; there is no equation to open.
- [ ] L9 is badged simulated **and** still names property and gold as not simulated.
- [ ] L6 shows *in flight* at Q1 of the hike, when credit has not moved at all.
- [ ] L6 never says *in flight* when the two printed credit numbers are the same.

## The drawer and the ticket

- [ ] Searching `IOU` finds **bond**, because the search reads meanings as well as terms.
- [ ] A term with an engine home offers *You can watch this one on screen*, and clicking it jumps to that tile.
- [ ] A term with no engine home, such as **fiscal policy**, says so instead of pretending.
- [ ] A wrong closed answer shows the reason, not just a cross.
- [ ] The open question is never marked right or wrong, and reveals its answer only when asked.

## If something fails

Fix that panel. Do not add features. The engine, the content contract and the
snapshot shape are settled, and 275 tests hold them there.
