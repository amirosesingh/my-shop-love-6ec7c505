# Register zoom preference, no stray scrolling, working Android update check

## 1. Register zoom lives in Display & sizing, defaults to 70%

Right now the zoom control floats on the register itself and resets to a "fit to screen" value every time the page is opened, so the till never keeps the size the operator chose.

- Register zoom becomes a saved terminal preference alongside interface size, text size and density, so it survives reopening the page, navigating away and restarting the app.
- Default is **70%**, applied on a fresh terminal with no saved choice.
- Settings → Display & text size gains a **Register zoom** row: slider from 25% to 200% in 5% steps, a numeric box, the live percentage, and a "Fit to screen" option that returns to the automatic fit behaviour.
- The floating +/−/fit bubble is removed from the register canvas; zoom is set from settings only, as requested.
- Ctrl/Cmd + wheel and touch pinch keep working on the till for a quick look, and what they land on is saved as the new preference rather than lost on reload.

## 2. No unnecessary scrolling on the register

Zooming out currently makes the canvas taller than the window (the content is laid out at the inverse size), which leaves a scrollbar even when everything is already visible.

- The canvas only scrolls when the content genuinely cannot fit — i.e. when zoomed in past the fitting scale. At or below fit it is clipped to the window with no scrollbar.
- The inner panels (catalogue list, ticket lines) keep their own scrolling, so the page itself no longer double-scrolls.

## 3. Android "Check for updates now" — Failed to fetch

On Android the app is served from a local `https://localhost` origin, so the browser-level `fetch` to the update host is a cross-origin request and is rejected before it leaves the device — surfacing as the bare "Failed to fetch".

- Update checks and downloads on the phone go through Capacitor's native HTTP path instead of the WebView fetch, which is not subject to CORS.
- Applies to the APK check (`latest.json`), the APK download, and the web-bundle manifest check, so background checks and the update banner all work too.
- Error text becomes meaningful: which step failed and the HTTP status or network reason, instead of "Failed to fetch".

## Technical notes

- `src/lib/use-ui-scale.ts`: add `zoom: number | "fit"` to `UiScalePrefs` (default `0.7`, clamped 0.25–2) with the existing localStorage persistence.
- `src/components/pos/ZoomCanvas.tsx`: read/write the preference instead of local state; drop the control bar; wrapper becomes `overflow-hidden` unless `scale > fit`; gesture handlers commit through `setUiScalePrefs`.
- `src/components/pos/DisplayScalingSettings.tsx`: new Register zoom slider + numeric input + "Fit to screen" toggle; "Reset to automatic" resets zoom to 70%.
- `src/lib/android-updates.ts` and `src/lib/web-bundle-updates.ts`: use `CapacitorHttp` from `@capacitor/core` when `isNative()`, falling back to `fetch` on web/Electron; APK download uses the native request with a base64 response written straight to cache (progress reported per request rather than per chunk).
- No backend or schema changes.