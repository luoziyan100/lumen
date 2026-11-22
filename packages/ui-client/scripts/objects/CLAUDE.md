# objects/ — Evidence for the isometric objects
> L2 | Parent: ../CLAUDE.md

These scripts drive Chromium 1228 and WebKit 2215 through playwright-core at `/tmp/lumen-s0-pw`. Chromium runs with `--disable-gpu`: GPU raster of 3D transforms flips a few pixels between identical frames. Output goes to the evidence directory given as an argument, never into the repo.

- `pixel-diff.mts`: O1's proof. Phase 1's `gallery.html` (git-ignored, read from the main checkout) and the product markup render in one page and one host, so only markup and CSS differ. It reports differing pixels per object and state, plus a control: phase 1 re-rendered against itself, the noise floor. It exits 1 if any rest capture differs.
- `easel-page.mts`: writes `easel.html`, the easel next to the box at the same scale with a state bench; `?set=`, `?open` and `?dark` pin a state.
- `easel.html`: the generated standalone page (O5); regenerate it after changing `easel.ts`.
- `easel-shots.mts`: the easel's review captures in both browsers (rest, hover, open, closed again, three mid-motion frames, open in dark), with checks for at least 150 shapes, no `<image>`, stillness and no script errors. `ONLY=chromium|webkit` runs one browser.
- `view-objects.ts`: the one list of the four view objects (press, cork board, lamp, type case): markup, CSS, hover values and the mid-state to pin. `views-page.mts` and `views-shots.mts` share it, so the page and the captures never disagree.
- `views-page.mts`: writes `views.html`, the four objects next to the box and the easel at 320px. `?only=<id>`, `?set=`, `?hover`, `?open` and `?dark` pin a state. Click a host to open it.
- `views.html`: the generated design page (V1–V4); regenerate it after changing an object.
- `views-shots.mts`: the V1–V4 checkpoint captures in both browsers: the whole row in light and dark, then per object rest, hover, mid, open, closed again and open in dark. It checks for at least 150 shapes, no `<image>`, stillness and no script errors.
- `music-page.mts`: writes `music.html`, the eight music objects (objects/music/) each in a host at its product viewBox width, labelled with slot, label, primitive count and line-weight tiers. Click a host to open it. `?only=<slot>`, `?open`, `?typing`, `?dark` (the dark skin's ink and paper tokens) and `?w=<px>` pin a state.
  - The page sets `data-hover` after the pointer stays 100 ms, as IsoObject does. It bundles the product's sound.ts and Sampler as `window.__music`; `?sound` turns the sound switch on (the first click unlocks).
- `music-serve.mts`: a static server on 127.0.0.1 (first free port of 5206–5209) rooted at packages/ui-client, because the page fetches its recordings and a file:// page cannot. Run directly, it opens `music.html?sound`: the owner's listening entry.
- `music-build-check.mts`: Q8's proof that the recordings ship as files the desktop CSP allows. It builds the bundle outside the repo, checks no `data:audio` in any .js/.css/.html and one .m4a asset per `SOURCES.md` row, then serves it through vite's `preview()` with tauri.conf.json's CSP as a header beside an isolated fixture service: the recordings load, a hover sounds, no CSP violation, no console error.
- `music-audio.mts`: the listening evidence and the offline half of the sound checks, in both browsers through `music-serve.mts`. It renders every part through the product's Player and Sampler into an OfflineAudioContext and checks decoding, onset ≤10 ms, pitch ≤2%, peak, loudness spread, pass length and rest. `VIDEO=1` films each state run at 15 fps with the engine's own plan of the same run as its sound track.
- `music.html`: the generated music design page; regenerate it after changing a music object.
- `music-shots.mts`: the music design-gate captures per object, browser and theme: rest, hover mid (1.1 s), open, typing (piano), plus a 3× crop of each object's `crop` region. It prints primitive counts and tiers and checks for no `<image>`, stillness at rest and no script errors. `ONLY`, `SLOT` and `THEME` narrow the run.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
