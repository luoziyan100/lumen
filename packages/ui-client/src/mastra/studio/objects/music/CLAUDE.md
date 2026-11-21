# objects/music/ — Line-engraved musical instruments
> L2 | Parent: ../CLAUDE.md

The second desk-object kit. Each object fills the same slot and viewBox as its instrument counterpart, so the hosts and the layout do not change.
The drawing is ink on paper only: ink is `var(--text)` and paper is `var(--surface-base)`, so a dark skin draws light lines on a dark ground.
Volume comes from hatching and engraved ticks. The only soft fill is the ground shadow. Line weights have four steps: `w0` .25, `w1` .6, `w2` 1.2 and `w3` 2.
Notes are paths, never glyphs. They rise only in the object's own blank space and fade out inside the frame.
Motion runs only on hover, `data-open` (click) or `is-typing`. Reduced motion stops all of it.

- `line.ts`: the engraving kit.
  - `curve` gives a path's `d` string, arc-length samples and normals from one description; other files derive geometry from it.
  - Shared drawing parts: `dbl` (double line: ink stroke under paper stroke), `inset` (offset lines clipped inside a closed shape), `ticks`, `hatch`, `screw`, `rivet`, `knurl`, `note`, `plate` and the ground shadow.
  - `count` counts primitives. `MUSIC_BASE` holds the shared rules.
- `bowed.ts`: the violin family's single model.
  - It mirrors one unit outline about the centre line and scales it.
  - The bridge stands on the f-hole notch line. The fingerboard ends before the bridge. Four strings run nut → bridge → tailpiece.
  - The bow's hair lies on y = 0. A translate along the bow's own axis keeps the contact point on the strings.
- `piano.ts` (`pn-`, 640×400): PIANO · I in Reading.
  - Grand piano in plan: 52 white keys and 36 black keys. The bridge is solved from the bent rim.
  - Hover plays a phrase. `is-typing` keeps playing and draws the staff. Click raises the lid in the elevation inset.
- `stand.ts` (`ms-`, 640×400): LEGGIO · II on the Board.
  - One stroke table drives both the ink's dashoffset and the pen's keyframes, sampled by arc length. Click turns the right leaf.
- `gramophone.ts` (`gr-`, 640×400): GRAMMOFONO · III in Takeaways.
  - The deck is drawn in plan and flattened by one transform.
  - The arm angle for a groove radius is solved from two intersecting circles. Hover sets the needle on the outer groove. Click walks it inward.
- `cello.ts` (`cl-`, 280×340): VIOLONCELLO · IV in Materials.
  - The bow has two poses on one group: leaning, and playing on the contact line.
- `musicbox.ts` (`mb-`, 260×220): CARILLON · V under the topic list.
  - The front card follows the takeaway box's `boxWords` contract.
  - A pin strip slides down the cylinder. Each pin plucks its own comb tooth at the time set in `TUNE`.
- `harp.ts` (`hp-`, 640×400): ARPA · VI in Map.
  - 40 strings run from the neck pins to the soundboard line. C strings are heavier and F strings are dashed.
  - Hover plays a broken chord. Click plays one glissando.
- `violin.ts` (`vn-`, 640×400): VIOLINO · VII in Ideas.
  - Hover bows. Click lifts the bow and plucks a pizzicato chord.
- `metronome.ts` (`mt-`, 640×400): METRONOMO · VIII in All.
  - The swing period is 60/bpm from the slider's mark. Click moves the slider from 72 to 120.
- `index.ts`: the single entry.
  - `MUSIC_OBJECTS` lists slot, label, design width, crop and builder.
  - `MUSIC_CSS` joins the base rules and each object's motion.
  - It also exports the structure constants that the tests assert.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
