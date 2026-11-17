# objects/ — Evidence for the isometric objects
> L2 | Parent: ../CLAUDE.md

These scripts drive Chromium 1228 and WebKit 2215 through playwright-core at `/tmp/lumen-s0-pw`. Chromium runs with `--disable-gpu`: GPU raster of 3D transforms flips a few pixels between identical frames. Output goes to the evidence directory given as an argument, never into the repo.

- `pixel-diff.mts`: O1's proof. Phase 1's `gallery.html` (git-ignored, read from the main checkout) and the product markup render in one page and one host, so only markup and CSS differ. It reports differing pixels per object and state, plus a control: phase 1 re-rendered against itself, the noise floor. It exits 1 if any rest capture differs.
- `easel-page.mts`: writes `easel.html`, the easel next to the box at the same scale with a state bench; `?set=`, `?open` and `?dark` pin a state.
- `easel.html`: the generated standalone page (O5); regenerate it after changing `easel.ts`.
- `easel-shots.mts`: the easel's review captures in both browsers (rest, hover, open, closed again, three mid-motion frames, open in dark), with checks for at least 150 shapes, no `<image>`, stillness and no script errors. `ONLY=chromium|webkit` runs one browser.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
