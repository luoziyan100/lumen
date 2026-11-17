# objects/ — Isometric objects in empty space
> L2 | Parent: ../CLAUDE.md

Each object fills one empty state with a hand-drawn thing; it never carries a control. Phase 1's kit (`doc/studio/prototype/objects/`, git-ignored) is the source. At rest, the box, the cabinet and the typewriter render pixel-identical to it in Chromium (`scripts/objects/pixel-diff.mts`).

- `iso.ts`: the kit, in TypeScript with erasable syntax only. Faces are flat SVG placed by CSS `matrix3d` (`kit` → `face`). Motion is `hinge` and `move`; `show` and `twin` handle visibility. The brushes are `rect`, `line`, `circle`, `text`, `grain` and `joints`. `css()` turns per-object variables into `@property` rules, the base transition, the `.iso-host:hover`, `[data-open]` and event-class rules, and the reduced-motion rule (1ms). `text()` always escapes `& < > " '` (`escapeXml`), so a title or a takeaway enters SVG as text only. `textWidth` counts wide characters as 1em and others as 0.6em; `wrapText` stops at N lines and ends in ….
- `box.ts`: the takeaway box. The front card shows `boxWords` (a stamp and two lines) inside a clip; the lid label 「只放你自己的话」 is drawing, not data. `--iso-lid`: hover 38, open 104.
- `cabinet.ts`: the card cabinet. It carries no data; its labels and sample card are drawing. `--iso-drawer`: hover 14, open 64.
- `typewriter.ts`: the typewriter. The paper shows `paperLines(title)` (three lines) inside a clip, and the cursor follows the last line. `--iso-paper`: hover 10, open 26. The `is-typing` event class runs the key and carriage keyframes (`iso-tw-type`).
- `easel.ts`: the easel, new in this phase; phase 1 has no source for it. The tripod leans back 12°, `solid()` draws the visible faces of a convex block, and the canvas turns about the mast (`pivot`). `--iso-tilt` turns the canvas on hover and open. `--iso-brush` 0→100 drives lift, one stroke and the return. `--iso-wet` fades the paint on close, and the brush resets only after the fade, while it already lies in the tray.
- `IsoObject.tsx`: the only React surface. It sets the markup once per data change; hover, open and typing move only CSS variables and classes. The host is `aria-hidden`, has no tabindex, and keeps focus where it was on mousedown. Its SVG takes no pointer events. It injects the shared sheet (`BASE` + every object's CSS) once per document.

Naming: variables are `--iso-*` and ids `iso-*`, so they never meet the app's own `--paper` or a page id. A view sizes its object by host class (`.topics-box`, `.materials-cabinet`, `.reading-typewriter`, `.board-easel`) in its own sheet.

Language: drawn labels come from `studio.objects` in the locale catalog; builders take them as arguments and import no catalog.

Data flow: view data (title, newest takeaway) → builder (escape, wrap) → markup string → IsoObject. State never rebuilds markup.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
