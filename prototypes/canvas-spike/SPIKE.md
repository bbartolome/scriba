# Canvas library spike (Wayfinder ticket: Canvas library for Angular)

**Question:** Which Angular-native node-canvas library should the Graph runner use?
**Candidates:** `@foblex/flow` 19.4.0 (default) vs `ngx-vflow` 2.7.0 (runner-up).
**Decision:** **`ngx-vflow`**, chosen by the user after reviewing the tablet and desktop screenshots. The ticket resolution records the reasons and the accepted costs.
**Analysis verdict (before the decision):** `@foblex/flow` passed all five must-criteria with no adapter workarounds. `ngx-vflow` also passed all five, but only after four workarounds, and its release cadence is slower. The decision overrides that recommendation on visual grounds (see the Recommendation section below).

Throwaway prototype. The app is in this directory; the checks are in `e2e/spike.cjs`. Both adapters render the same JSON contract (`src/app/spike/contract.ts`), share one runtime store, and use the same port generator.

## Results

Live run, headless Chromium, 26/26 checks passing (`e2e/out/results.json`). Desktop checks use the mouse; touch checks use CDP `Input.dispatchTouchEvent` on a 820×1180 viewport.

| Must-criterion | `@foblex/flow` | `ngx-vflow` |
| --- | --- | --- |
| **Typed ports** (text → entity refused; text → text connects) | Pass. `fCanBeConnectedTo` category allow-list refuses the gesture; no event is emitted | Pass. `connection.validator` refuses; no `connect` is emitted |
| **External drop onto a port** (desktop + touch) | Pass. The port is a plain DOM connector, so the drop targets it directly | Pass, after the handle workaround below |
| **Auto-generated node from spec** | Pass. Node renders one row per spec property (3) | Pass. Same port generator, same count |
| **Touch** (connect, node move, chip drop) | Pass | Pass |
| **Signals** (run status + inline result) | Pass. Status and result update from store signals | Pass |
| Two views from one JSON (story + recipe) | Pass | Pass |
| Lossless contract (edges stored as port ids, no library ids leak) | Pass | Pass |

Both libraries pass every check. The difference is how much adapter code each needed.

## Workarounds needed

**`@foblex/flow`:** none beyond the standard theme import in `angular.json`. Connectors are real DOM elements, so typed ports and external drops use the library's own surface.

**`ngx-vflow`** (each one was needed to get the checks to pass):

1. **Visible handles have no id.** The default handle is an SVG `circle` without `data-port`, so ports can't be hit-tested by id. Fix: a custom handle template (`ng-template let-h` with `svg:circle` at `h.point()`). Plain HTML inside the SVG handle layer has zero size, so an SVG element is required.
2. **Handles must sit inside their row.** The library positions a handle from its parent element. With all handles directly under the node, every port landed at the same point, and `offsetY` was ignored.
3. **`ConnectionControllerDirective` is not exported on its own.** It is reachable only through the `Vflow` tuple. Our first `connectEnd` attempt never fired for valid connections. The `connect` output works.
4. The connection validator is passed as a plain `ConnectionSettings` object, which is fine. The internal `ɵConnectionModel` class is not needed.

## Maintenance

- **`@foblex/flow`:** 19.1.7 (2026-09-06), 19.2.0 (09-20), 19.3.0 (09-27), 19.4.0 (10-25). Repo last pushed 2026-10-25. 6 open issues, 541 stars, MIT.
- **`ngx-vflow`:** 2.5.0 (2026-03-09), 2.5.1 (04-04), 2.6.0 (04-26), 2.7.0 (09-03). Repo last pushed 2026-10-26. 32 open issues, 486 stars, MIT.

## Not tested (open risks)

- **Real devices.** Touch uses synthesised CDP events in headless Chromium. Not tested on a real tablet or on Safari/iOS. Do this before the canvas-UI phase is built.
- **Angular Material styling.** Not in the must-list, so not tested.
- **Layout.** Node positions are not tuned. In the `ngx-vflow` story view, the Expand and Chapter-draft nodes overlap at the default coordinates (`e2e/out/vflow-tablet.png`). Not investigated. The layout is a property of the contract, not the library.
- **Scale.** No large-graph or performance measurement.
- **Schema change → UI update.** Ports are generated from the spec at load time. Editing the spec and seeing the node update was not tested.
- **External drop refusal** (chip onto a text port) is app logic in both adapters, so it doesn't distinguish the libraries.

## Reproduce

```sh
cd prototypes/canvas-spike
npm install
npx ng serve --port 4300        # /foblex and /vflow routes
npx playwright-core install chromium   # once, if no Chromium is cached
node e2e/spike.cjs              # prints PASS/FAIL per check, writes e2e/out/results.json
```

## Recommendation

Use **`@foblex/flow`** for the Graph runner's canvas. Keep the `graphs/` JSON as the contract. The renderer is replaceable, so `ngx-vflow` stays a fallback if `@foblex/flow` stops shipping.
