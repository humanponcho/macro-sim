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

These two are the only items with no automated coverage at all. Everything else
on this page is also checked by `npm test`; these are pure browser behaviour,
so a machine here cannot see them.

### Slider drag

- [ ] Drag the policy rate from 3.50 to 5.00 in **one** movement. The thumb follows the pointer the whole way.
- [ ] The number beside the slider counts up continuously as you drag, not once at the end.
- [ ] Release the slider. The rest of the screen is unchanged, because a pending value only affects the next quarter.
- [ ] Drag the energy supply shock the same way. Same behaviour.
- [ ] Click a slider, then use the arrow keys. The value steps and the readout follows.

If the thumb jumps once and then stops following the pointer, a redraw is
destroying the input mid-drag and releasing pointer capture. See the comment in
`slider()` in `src/ui/app.js`; that is exactly the bug it describes.

### Keyboard focus

- [ ] Click Advance, then press Space. It advances again.
- [ ] Press Backspace with nothing focused. It steps back a quarter.
- [ ] Click into the policy-rate slider, then press Space. It must **not** advance.
- [ ] Open a dropdown, press Space. It must **not** advance.
- [ ] Open the glossary drawer, click the search box, type a word with a space in it. The space is typed and the quarter does **not** advance.

The guard is one line in the `keydown` handler in `src/ui/app.js`: the key is
ignored when focus is on an input, a select or a button. The drawer search box
is the case worth trying, because it is the only place a class would type a
space on purpose.

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
