# Android: secure storage error + top-bar branch picker

## 1. "SecureStoragePlugin.then is not implemented"

This is the same trap already documented and fixed for the Preferences plugin in `src/lib/mobile-storage.ts`: a Capacitor plugin object is a Proxy that answers *every* property lookup — including `then` — with a native bridge call. In `src/lib/secure-cloud-config.ts` the helper is:

```
async function androidStore(): Promise<SecureStoragePluginType> {
  const mod = await import("capacitor-secure-storage-plugin");
  return mod.SecureStoragePlugin as ...;
}
```

Returning the plugin from an `async` function makes the runtime treat it as a thenable and call `SecureStoragePlugin.then(...)`, which the Android bridge rejects with "not implemented". Every cloud-key read/write on the phone goes through this helper, so saving or loading the central connection fails.

Fix: return the plugin inside a wrapper object (`{ value: plugin }`), exactly as `loadPrefs()` does, and unwrap it at each of the four call sites (`androidRead`, `saveCloudCredentials`, `removeCloudCredentials`). Add a guard so a missing/typo-free plugin returns `null` instead of throwing, and keep the existing try/catch fallbacks so a failure degrades to "not configured" rather than a crash.

## 2. Remove the branch selector from the Android top bar

The mobile header in `src/components/pos/AppShell.tsx` renders a `StorePicker` on the right when the user may switch branches. The same picker already exists in the slide-out side navigation header, so it is duplicated.

Change: on the mobile header, always show the compact branch-code badge (with its shift colour) instead of the picker — drop the `mayPickStore` branch there. The picker inside the drawer's `SidebarNav` header stays untouched, so branch switching still works from the side menu on both Android and mobile web.

## Files

- `src/lib/secure-cloud-config.ts` — wrap the plugin handle, unwrap at call sites.
- `src/components/pos/AppShell.tsx` — mobile header shows the branch badge only.

Version bumped with `node scripts/bump-version.cjs` as usual.
