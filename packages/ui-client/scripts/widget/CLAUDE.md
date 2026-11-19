# scripts/widget/
> L2 | Parent: ../CLAUDE.md

Browser evidence for the widget sandbox's promises that jsdom cannot show. Nothing here ships.

- `ui-assert-widget-send.mts`: loads the real receiver document in Chromium and WebKit and proves the send gate: a real click or key press in the widget sends; a call on load, on a timer, after a synthetic event, or `SEND_WINDOW_MS` after the last touch sends nothing. Uses playwright-core from `/tmp/lumen-s0-pw` like the other assertions; needs no service and no port.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
