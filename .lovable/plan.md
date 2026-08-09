# Fix browser console form/field and resource warnings

## What's happening

Three separate DevTools messages, only one of which is app code:

1. **"A form field element should have an id or name attribute"** — Chrome's autofill heuristics warn for every text input rendered without `id` or `name`. The shared `Input` component (`src/components/ui/input.tsx`) passes props straight through, and most screens render `<Input value=... onChange=... />` with only an `aria-label` or a sibling `<Label>`, so no `id`/`name` reaches the DOM. This is the bulk of the noise.
2. **"Deprecated feature used" (x3)** and **"Response was blocked by CORB"** — these are emitted by the preview/dev tooling and third-party scripts, not by application source. They need to be identified from the live page before deciding whether anything in the app can change; they are typically harmless dev-only messages.

## Plan

### 1. Make every field self-identifying (one central change)

Update the shared primitives so a stable identifier is always present, without touching hundreds of call sites:

- `src/components/ui/input.tsx`: generate a fallback with React `useId()`; use the caller's `id`/`name` when given, otherwise derive a slug from `aria-label`/`placeholder` and fall back to the generated id. Set both `id` and `name`.
- Apply the same treatment to `src/components/ui/textarea.tsx`.
- Leave `type="hidden"`, file inputs, and any explicitly named field untouched.

This keeps existing labels, forms, and tests working while removing the warning globally.

### 2. Field-level polish where it matters

For the real credential/entry forms (login, PIN entry, member/staff/product dialogs), add explicit `name` and correct `autoComplete` values so browser autofill behaves sensibly instead of relying on the generated fallback.

### 3. Identify the deprecation and CORB messages

Load the running app in a headless browser, capture the full console entries with their source URLs, and report what emits them. If a message originates from application code, fix it in the same pass; if it comes from the preview harness or an external script, say so plainly rather than making speculative changes.

## Technical notes

- Uses `React.useId()`, which is SSR-safe and hydration-stable in TanStack Start.
- No behavioural or business-logic changes; purely attributes on rendered elements.
- Verification: headless browser run over the register and a couple of settings pages, confirming the field warning is gone and no new console errors appear.
