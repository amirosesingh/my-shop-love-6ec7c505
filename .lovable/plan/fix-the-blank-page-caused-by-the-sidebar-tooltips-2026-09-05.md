# Fix the blank page caused by the sidebar tooltips

## What's happening

When the sidebar is collapsed, each menu icon shows a small hover label. Those
labels are being rendered without the wrapper they require, so the whole screen
crashes with "`Tooltip` must be used within `TooltipProvider`" and the user sees
the "This page didn't load" screen instead of the app.

Confirmed by reading the code: `SidebarNav` imports and renders
`Tooltip`/`TooltipTrigger`/`TooltipContent` but nothing in its tree provides the
required `TooltipProvider`. Every other place that uses tooltips (the POS action
buttons, the shared sidebar component) does include it, which is why only this
screen breaks.

## The fix

1. Wrap the sidebar navigation's rendered output in the tooltip provider so the
   hover labels have their required context.
2. Add the same provider once at the app shell level so any future tooltip
   anywhere in the app cannot crash the page for the same reason.
3. Re-run the existing test suite and bump the version with the project's
   version script.

## Technical notes

- File: `src/platforms/web/components/pos/SidebarNav.tsx` — import
  `TooltipProvider` from `@/components/ui/tooltip` and wrap the component's root
  element (`delayDuration={0}` to match the shared sidebar behaviour).
- File: `src/platforms/web/components/pos/AppShell.tsx` — wrap the shell's
  children in `TooltipProvider` as a safety net. Nested providers are supported
  by Radix, so existing local providers keep working.
- No behaviour, styling, or business logic changes beyond adding the provider.
- Verify with `bunx vitest run`, then `node scripts/bump-version.cjs`.
