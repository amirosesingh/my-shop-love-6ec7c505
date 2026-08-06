# Fit-to-screen zoom engine for the register canvas

## 1. Automatic fit on load and on resize

The register work area (catalog, ticket, order summary) becomes a zoomable canvas. On first render, and whenever the window or panel is resized, the app measures the available space against the content's natural size and applies the largest scale that fits without clipping or horizontal scrolling. This becomes the "baseline" — the 100% Fit state — so a 1024x768 till and a 4K desktop both open with the whole till visible.

While the user has not touched the zoom controls, the canvas keeps re-fitting on every resize. As soon as they zoom manually, their choice sticks until they press Reset / Fit.

## 2. Manual zoom controls

A compact zoom bar sits in the corner of the canvas:

- Zoom out (−), live percentage readout, zoom in (+), and a Reset / Fit-to-screen button.
- The readout shows the exact current scale (75%, 100%, 125%…), updating live during pinch and wheel gestures.
- The − and + buttons step by a smooth multiplicative factor and disable at the limits.

Gestures supported directly on the canvas:

- Ctrl/Cmd + mouse wheel or trackpad pinch zooms around the pointer, so the point under the cursor stays put.
- Two-finger pinch on touch screens does the same around the midpoint of the fingers.
- Plain scrolling still scrolls the page/panels; only Ctrl/Cmd-modified wheel and pinch zoom.

## 3. Bounds and feel

- Zoom range 25% to 400%, clamped.
- Wheel and pinch scale by gesture magnitude (not a fixed step per event) so a trackpad flick doesn't slam straight to the limit.
- Button-driven zoom animates with a short CSS transition; gesture-driven zoom is applied immediately so it tracks the finger. Rendering stays crisp via `transform: scale()` on a GPU-composited layer.
- Above the fit scale the wrapper becomes scrollable so the user can pan to the off-screen part of the till.

## 4. Cleanup of conflicting sizing code

- Remove the fixed pixel widths and container-query breakpoints in the register layout and shared action button that currently fight the fluid layout (the fixed-width discount button, the `@container` / `@[…]` label breakpoints, any leftover `data-tsd-source` attributes).
- The summary rows are standardised to a single fluid full-width column: label left and truncating, value or control flush right.
- The existing global interface-scale preference stays as the typography/control-height system; the new canvas zoom layers on top of it rather than duplicating it, so there is no double scaling. The manual "Interface size" slider in Display settings keeps working and simply shifts the fit baseline.

## 5. Viewport

Allow native pinch-zoom on mobile alongside the in-app controls:
`width=device-width, initial-scale=1.0, minimum-scale=0.5, maximum-scale=2.0, user-scalable=yes, viewport-fit=cover`
in the root route head and the Capacitor shell HTML.

## Technical notes

- New `src/components/pos/ZoomCanvas.tsx`: `ResizeObserver` on the viewport wrapper plus the content element computes the fit scale; state holds `{ scale, userAdjusted }`; exposes the control bar. Anchored zoom math keeps the cursor point fixed by adjusting the pan offset alongside the scale.
- Wheel handling uses a native non-passive listener (React's `onWheel` is passive, so `preventDefault` is ignored) and normalises `deltaMode`; pinch arrives as a wheel event with `ctrlKey`. Touch pinch via Pointer Events with `touch-action: none` on the canvas.
- `src/routes/index.tsx`: wrap the register grid in `ZoomCanvas`; clean the totals block (drop `@container`, `@[40rem]:grid-cols-2`, `w-32`/`sm:w-32`).
- `src/components/pos/ActionButton.tsx`: drop container-query label classes, add an explicit `iconOnly` prop.
- `src/lib/use-ui-scale.ts` unchanged in behaviour; `src/routes/__root.tsx` and `capacitor-shell/index.html` for the viewport meta.