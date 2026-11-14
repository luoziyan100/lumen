# studio/ — Topic and whiteboard workspace
> L2 | Parent: ../CLAUDE.md

The board is the topic's shared draft; conversation lives in the sprite. The board stays read-only to the user. Product rules live in doc/studio/.

- `StudioApp.tsx`: sole workspace shell; aligned 50px panel headers and 8px gaps, persisted topic, busy-session selection, side panes, split/full reader and the window-level sprite. Full reader preserves the mounted board and its camera.
- `Panes.tsx`: persisted side visibility and split ratio, physical-key shortcuts, accessible toggles and 8px splitter; board/reader minimums are 360/420px.
- `TopicPanel.tsx`: topic list and 3s status polling, inline creation and the settings entry; experts live inside settings.
- `ViewNav.tsx`: five icon/text views; symmetric room for pane toggles keeps navigation centered. A hidden full-width copy determines when only icons fit; aria labels remain available.
- `Board.tsx`: sheet tabs (board glyph + number, full title in title/aria-label, folded dimmed, a dot on the run's target while the AI draws), the folded-selection hint, read-only blocks, pan/zoom, frame and tool activity; at most two live widgets. Hidden zero-width boards do not reflow.
- `layout.ts`: pure 1–3 column display layout with 300–440px columns; stored server coordinates remain untouched.
- `Block.tsx`: text, ladder, table and sandboxed widget rendering, source navigation and superseded presentation; Markdown/Mermaid must fit their column.
- `useBoard.ts`: sheet selection stored on the service (R16; an older service without the route, 404/405, still switches locally; any other failure to store the pick is shown in the board error until a later pick is stored), the run target, refresh from conversation tool signals, with a 5s list/ETag fallback only while running.
- `Materials.tsx`: title/link filtering, upload in the header, descending material list, fixed-width kind icons and title/link rows. Removing a reference keeps the library original; opening a source enters split reading.
- `Sprite.tsx`: owns the sole conversation subscription and one useSpriteExpression snapshot shared by both renderers. Body/avatar mount changes during opening and closing never reset the expression clock. Existing 60×92 hitbox, anchors, drag, dock, unread handling and session controls remain here.
- `SpriteFigure.tsx`: pure A04 renderer; compact uses the supplied 2x/3x sources and desktop uses 452px Retina derivatives. Both sizes share five faces, one persistent neutral silhouette and fixed facial overlays; PNG masters are never imported.
- `SpriteFigure.css`: float/think/wait/speak motion on one wrapper, invariant neutral shadow, glow, face masks and opacity cross-fades. Hidden documents pause motion; reduced motion removes animation and transitions for both renderers.
- `SpriteFace.tsx`: pure circular A04 avatar renderer and head source map; consumes the exact snapshot used by the body. Its facial overlays leave the neutral hair/outline invariant.
- `sprite-face.ts`: state mapping, single-timer FaceDriver and useSpriteExpression lifecycle. Idle blinks after 4–7s for 120ms; speech alternates after 180–260ms. Hidden/reduced owners schedule no expression timers; unmount cancels the owner.
- `sprite-desktop/`: retained native entry/bridge and local preference; centrally disabled, with no settings entry or projection. Its own window uses the same A04 renderer and pauses its owner while invisible.
- `sprite-place.ts`: pure nearest-edge anchors, viewport clamping, legacy migration, 4px drag threshold, 16px keyboard moves and open/close/reduced keyframes. Resizing changes display clamping, never the stored anchor.
- `useSpriteMove.ts`: pointer capture and drag/click separation, ref-only motion during drag, anchor persistence on release, and reversible Web Animations. During transitions inert shields the outgoing form; no duplicate animation layer is created.
- `useSpeaking.ts`: current native assistant text projects through stream-pulse; collapsing keeps text updates and opening reuses the subscription.
- `studio.css`: token-based shell geometry, typography, controls, pane/reader layout, view navigation, materials and sprite interaction chrome. Shared character rendering lives in SpriteFigure.css.

Expression flow: session → spriteState → one useSpriteExpression → SpriteFigure + SpriteFace. Position and window lifecycle never flow back from the art layer.

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
