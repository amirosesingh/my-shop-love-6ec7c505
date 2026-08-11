# Online-mode sales must not wait on the local database

## What's wrong today

On the Windows till, every save — including finishing a sale and recording payment — goes to the local SQL Server **first**, no matter what the Online/Offline switch says (`commitOps` in `src/lib/pos-db.ts`). If local SQL is down, slow or not configured, the cashier waits for it to fail before the cloud is even tried, and a stuck local engine can surface an error at checkout.

Scan result for Step 2: there are no hardcoded "local DB required" guards in the checkout UI. The files named in the request (`PaymentModal.tsx`, `CheckoutContainer.tsx`, `src/services/pos-payment.ts`, `src/services/shifts.ts`) do not exist in this project; local-database calls only appear in the Local Database settings screen and the sync toggle, which is correct. Nothing to remove there — the blocking behaviour lives entirely in the commit path.

## What will change

1. **Online mode = cloud first.** When the switch is on Online and the line is up, the sale/payment/shift write goes straight to the central database. As soon as it succeeds, checkout returns and the receipt prints.
2. **Local copy in the background.** The identical rows are then written to local SQL as a detached task marked already-synced. Any failure there is logged quietly to the sync log — it never reaches the checkout screen.
3. **Automatic fallback.** If the cloud write hits a network/timeout error in Online mode, the local database is tried as the fallback and the rows are flagged as pending sync.
4. **Only when both fail** does the existing non-blocking "Database Storage Unavailable" notice appear, with the cart left untouched.
5. **Offline mode is unchanged**: local first, queued for later push.

## Technical notes

- `src/lib/pos-db.ts` → `commitOps`: split the desktop branch into cloud-first (when `effectiveDatabaseMode() === "online"`) and local-first (offline). Cloud-first path awaits `runOpLive`, returns `"cloud"`, and fires a `void`-ed mirror through the `localDb()` bridge wrapped in try/catch that only writes to the sync log. Cloud failure with `isConnectionError` falls back to the bridge write; both failing throws the existing `AllTargetsFailed`.
- `src/lib/db-router.ts`: keep `write` as the single gateway; its existing `mirrorLocally` becomes the shared background-mirror helper so `insert/upsert/update/delete` inherit the same behaviour, and mirroring stops being awaited.
- Non-connection cloud errors (permission denied, constraint violations) still surface immediately — those are real problems, not connectivity.
- Add tests in `src/lib/__tests__/` covering: online-mode cloud success with a failing local bridge still resolving successfully, and cloud-timeout falling back to local.
