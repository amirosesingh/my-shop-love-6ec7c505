# Register summary: fit-to-width, zoom controls, camera only on small screens

## 1. Camera scan button only on phones/small screens

In the scan bar, the camera button currently shows on any device with a webcam, including desktops. Change the condition so it only appears when the app runs as the native Android app, or the screen is genuinely small (under the mobile breakpoint) with a usable camera. On desktop or a large tablet layout there is no camera button and no inline camera preview — the barcode field and hardware scanner stay as they are. If the window is resized down to phone width the button reappears; if resized up while the preview is open, the preview closes.

## 2. Clean up the order summary and make it fit any width

The totals panel in the register currently uses container queries and a fixed-width discount button, which is what pushes "Add discount" out to the right edge and causes clipping on narrow screens.

- Drop the container-query wrappers and the two-column split from the totals block; use a single fluid column that is always full width with `min-w-0`, so nothing overflows horizontally at any width.
- Every summary row (Subtotal, Store credit, Bill discount, Promotion discount, Discount applied, Tax, Balance due) becomes the same flex row: label left and truncating, value or control flush right.
- The "Add discount" control loses its fixed width and sits flush right in its row like the numeric values, sized to its own content.
- Remove leftover `data-tsd-source` attributes if any remain, and the container-query label classes in the shared action button — replace with a plain icon+label button that hides its label only when explicitly asked to, so callers no longer depend on container width.

## 3. Zoom controls with percentage indicator

Add a small zoom bar to the summary panel:

- A `−` button, a percentage badge, a `+` button, and a Reset control.
- React state `zoomLevel`, default 100, range 50–200, steps of 10.
- The summary content is wrapped in a container with `transform: scale(zoomLevel/100)` and `transformOrigin: 'top left'`; the wrapper switches to `overflow-auto` above 100% so the user can pan.
- Buttons disable at the min and max bounds. Zoom is per-session state, not persisted.

## 4. Viewport / pinch-to-zoom

Update the viewport meta so native pinch-zoom is allowed alongside the buttons:
`width=device-width, initial-scale=1.0, minimum-scale=0.5, maximum-scale=2.0, user-scalable=yes, viewport-fit=cover`
in the root route head and in the Capacitor shell HTML.

## Technical notes

- `src/components/pos/ScanBar.tsx`: gate `hasCamera` on `isNativeApp() || (useIsMobile() && getUserMedia present)`; close `webScan` when it goes false.
- `src/routes/index.tsx`: totals block around lines 1535–1682 — remove `@container` and `@[40rem]:grid-cols-2`, drop the `w-32`/`sm:w-32` fixed widths, normalise rows, add the zoom wrapper and control bar.
- `src/components/pos/ActionButton.tsx`: remove container-query label classes; add an `iconOnly` prop for callers that want icon-only.
- `src/routes/__root.tsx` (viewport meta) and `capacitor-shell/index.html`.