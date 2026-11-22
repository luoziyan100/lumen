# objects/music/ — Line-engraved musical instruments
> L2 | Parent: ../CLAUDE.md

The second desk-object kit. Each object fills the same slot and viewBox as its instrument counterpart, so the hosts and the layout do not change.
The drawing is ink on paper only: ink is `var(--text)` and paper is `var(--surface-base)`, so a dark skin draws light lines on a dark ground.
Volume comes from hatching and engraved ticks. The only soft fill is the ground shadow. Line weights have four steps: `w0` .25, `w1` .6, `w2` 1.2 and `w3` 2.
Notes are paths, never glyphs. They rise only in the object's own blank space and fade out inside the frame.
Motion runs only on the confirmed hover (`data-hover`, set by IsoObject after the pointer stays 100 ms), `data-open` (click) or `is-typing`. Reduced motion stops all of it.
A lasting motion never loops forever: each iteration is an 80 ms still lead, one pass, then a rest of at least max(pass, 4 s) on the last frame (`cycle.ts`). Its sound rests with it.
Sound follows the running animation, never a separate timer. Every sound is a recording; nothing is synthesized.

- `line.ts`: the engraving kit.
  - `curve` gives a path's `d` string, arc-length samples and normals from one description; other files derive geometry from it.
  - Shared drawing parts: `dbl` (double line: ink stroke under paper stroke), `inset` (offset lines clipped inside a closed shape), `ticks`, `hatch`, `screw`, `rivet`, `knurl`, `note` (wrapped in `.mu-note`, which the frame checks find), `plate`, `detail` (a marked spot led to a round 3:1 window) and the ground shadow.
  - `count` counts primitives. `MUSIC_BASE` holds the shared rules.
- `bowed.ts`: the violin family's single model.
  - It mirrors one unit outline about the centre line and scales it.
  - Each f-hole is a tilted S-shaped stem that tapers at both ends, from a small inner upper eye to a large outer lower eye, with wings at its middle.
  - The bridge stands on the f-hole notch line. The fingerboard ends before the bridge. Four strings run nut → bridge → tailpiece.
  - The bow has a pointed head, an ebony frog (pearl eye, ferrule, slide) and a screw button. Its hair lies on y = 0. A translate along the bow's own axis keeps the contact point on the strings.
- `piano.ts` (`pn-`, 640×400): PIANO · I in Reading.
  - Grand piano in plan: 52 white keys and 36 black keys. The treble bridge is solved from the bent rim.
  - The bass strings are one parallel band. They cross over the tenor strings onto their own bridge, and their hitch pins run along the inner rim.
  - Hover plays a phrase. `is-typing` keeps playing and draws the staff. Click raises the lid in the elevation inset; it sounds the lid only.
- `stand.ts` (`ms-`, 640×400): LEGGIO · II on the Board.
  - One stroke table drives both the ink's dashoffset and the pen's keyframes, sampled by arc length. Click turns the right leaf.
- `gramophone.ts` (`gr-`, 640×400): GRAMMOFONO · III in Takeaways.
  - A near-cubic panelled case with mouldings and corner posts; the record nearly fills the top. The deck is drawn in plan and projected by one oblique matrix, the same projection as the case top. The crank sits on the right face.
  - The horn lives in `horn.ts`. The tapered tone arm swings from a swivel that carries the horn. The soundbox at its end cancels the plane transform and counter-rotates with the arm, so it always faces the viewer. A bracket from the back of the case holds the horn. DETAIL A magnifies the soundbox.
  - The arm angle for a groove radius is solved from two intersecting circles. Hover sets the needle on the outer groove. Click walks it inward.
- `horn.ts`: the gramophone's 3D horn.
  - It sweeps a petalled profile along a 3D cubic spine, projects the mesh orthographically and paints it far to near, so the near wall hides the far one.
  - Shade is hatch density only: meridian hatching inside, darker toward the throat; ring hatching outside, darker away from the light. The rim is one smooth scalloped ring drawn last.
- `cello.ts` (`cl-`, 280×340): VIOLONCELLO · IV in Materials.
  - The bow has two poses on one group: leaning, and playing on the contact line.
- `musicbox.ts` (`mb-`, 260×220): CARILLON · V under the topic list.
  - The front card follows the takeaway box's `boxWords` contract.
  - A pin strip slides down the cylinder. Each pin plucks its own comb tooth at the time set in `TUNE`.
- `harp.ts` (`hp-`, 640×400): ARPA · VI in Map.
  - 40 strings run from the neck pins to the soundboard line. C strings are heavier and F strings are dashed.
  - Hover plays a broken chord. Click plays one glissando.
  - DETAIL A magnifies the disc action under the neck.
- `violin.ts` (`vn-`, 640×400): VIOLINO · VII in Ideas.
  - Hover bows. Click lifts the bow and plucks a pizzicato chord.
  - DETAIL A magnifies the bridge, the strings and the fine tuner. Its coordinates come from the main view.
- `metronome.ts` (`mt-`, 640×400): METRONOMO · VIII in All.
  - The swing period is 60/bpm from the slider's mark. Click moves the slider from 72 to 120.
  - DETAIL A shows the escapement. The anchor rocks with the rod. The wheel steps half a tooth on each beat.
- `cycle.ts`: the rhythm of every lasting motion. `cycle(run)` gives lead, run, rest and total. `restFrames` re-times keyframes written for one period into lead + pass + rest; seconds inside a pass do not change.
- `pitch.ts`: the score types (`Cue`, `Loop`, `Score`, `Motion`) and the one pitch map, part number → MIDI note, tuned as each real instrument. A noise cue names its recording family.
  - A score is `{ open, close, hoverIn, loops, limit }`. A loop names the state it runs in, its cycle and its clock: the CSS animation and element whose iterations its passes follow.
- `meter.ts`: the one yardstick for loudness, onset and pitch. The sampler, the unit tests and the browser checks all measure with it.
- `samples/`: 63 CC0 recordings (mono AAC .m4a, 44.1 kHz, about 1 MB) and `SOURCES.md`, one row per file: library or author, file URL, item page, license, original SHA-256, measured pitch and processing. Every file starts at its attack.
  - The license pages and raw downloads stay in the task's evidence, never in the repo.
- `samples.ts`: the generated manifest. `SAMPLES` gives each recording's asset URL (`?no-inline`, so Vite never inlines it), measured pitch and length. `sampleFor(cue)` picks the nearest recording of the cue's family, at most ±3 semitones (`MAX_SHIFT`) by playbackRate.
- `sampler.ts`: `Sampler`, the only `Engine`. It fetches each recording once per page and decodes once per context. A pitched cue starts at its attack (peak −40 dB) with a 2 ms fade-in. Each part is levelled from its own mix.
  - A cue sounds for its score length at most and releases inside it. The gramophone's line runs through the horn band (300 Hz–3 kHz) with wow and flutter.
  - A missing recording leaves its parts silent. The first failure writes one console line.
- `sound.ts`: the scheduling. It decides when a sound starts and stops; the `Engine` seam decides what it sounds like (the tests use a fake).
  - `Player` gives each slot a shot bus and a loop bus. A state change plays its one-shot (open, close, hoverIn). A new shot fades the last in 50 ms and ducks the loop.
  - A loop plays one pass per CSS iteration. Before each pass it reads the clock animation's own phase, so sound and picture never drift. A changed state fades the old loop in 80 ms.
  - One object sounds at a time: the one under the pointer, else the one that most recently began to sound (a loop, or a click's one-shot while it rings). The others go silent and come back at their next pass start.
  - Nothing is fetched and no AudioContext exists before `unlockMusic`: the switch turned on, or the first pointerdown/keydown after `armMusic` when the switch was on at start. Then each slot loads when its host comes into view. A pass whose recordings are not ready is skipped, never replayed late.
  - `planMotion`/`renderPlan` play a timed run of states through the same Player into an OfflineAudioContext, for the listening evidence.
- `index.ts`: the single entry.
  - `MUSIC_OBJECTS` lists slot, label, design width, crop and builder.
  - `MUSIC_CSS` joins the base rules and each object's motion.
  - `MUSIC_SCORES` holds each slot's score. `partsOf`/`partCues` name a slot's sounds: open, close, hoverIn, loop0…n.
  - It also exports the structure constants that the tests assert.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
