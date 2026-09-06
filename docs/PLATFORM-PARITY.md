# What each shell can do

One codebase runs in three places. This table is the reference to check before
shipping anything that touches hardware, storage or updates, so a change does
not silently land on one platform only.

| Capability | Browser | Android phone | Windows till |
| --- | --- | --- | --- |
| Sells offline against a local database | no | no | yes |
| Prints to attached hardware, opens the drawer | no | no | yes |
| Camera barcode scanning | yes | yes | yes (when a webcam is attached) |
| Staff PIN sign-in | no | yes | yes |
| Terminal activation and emergency access | no | yes | yes |
| Secrets sealed by the operating system | no | Keystore | DPAPI |
| Receives new app code without reinstalling | yes (page reload) | yes (bundle update) | no — installer only |
| Window chrome (title bar, kiosk) | no | no | yes |

Source of truth in code: `src/platform-config/features.ts`.

## Rules that follow from this

- The revocation check (`src/lib/use-revocation-check.ts`) runs in the single
  shared `AppShell`, so all three shells inherit it. Do not add a
  platform-specific copy.
- A revoked or deleted terminal must erase its saved activation. On Windows
  this goes through the `terminal:clear` channel, which is deliberately open to
  any signed-in level — a cashier, or nobody, must be able to trigger it.
- The till only gets new code inside an installer. Anything that must reach the
  field needs a release build; verifying it in the browser preview is not
  evidence that a till has it.
