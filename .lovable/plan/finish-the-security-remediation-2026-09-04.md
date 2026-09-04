# Finish the security remediation

Refunds are done (server-side quantity limits, repeat protection, branch and permission
proven on the server). Four items from your list are still open, plus the closing report.

## 1. The committed configuration file

`.env` is still tracked in version control and holds live values. `.gitignore` now blocks it,
but ignoring a tracked file does nothing — it must be untracked. I cannot run version-control
commands here, so this part is split:

- I add `docs/secrets-rotation.md`: the exact command to untrack the file, the list of every
  value in it, and which of them must be treated as leaked and replaced.
- I make the app read its configuration only from the running environment, so once the file is
  untracked nothing breaks: the checked-in copy is no longer part of any build path.
- A test fails the build if `.env` is ever tracked again or if a key-shaped string appears in
  source.

You then rotate the publishable/anon key and the service key in the backend, and untrack the
file. Everything else in this plan I finish here.

## 2. Desktop network requests from the app window

The desktop shell exposes three network channels (`net:get-json`, `net:head`,
`net:get-binary`) that pass the address straight to the main process with redirects followed
automatically. Anything running in the window can therefore make the desktop app fetch any
address, including machines inside your network.

Fix: a single gate every one of the three goes through.

- Only `https:` is accepted. `file:`, `data:`, `javascript:`, `blob:` and plain `http:` are
  refused outright.
- Only the update feed's own hosts are accepted, taken from the configured update address —
  not a list the window can extend.
- Redirects are inspected rather than followed blindly; a redirect leaving the allowed hosts
  ends the request.
- Private and loopback addresses are refused.

## 3. The rest of the desktop bridge

There are 109 channels between the window and the desktop process. I review them all and, for
each one that takes an argument, add argument checking at the boundary: expected shape only,
unknown fields dropped, no free-form file paths, no command execution, size limits on
printing and on database payloads. Channels that only read state are left alone. The preload
list is trimmed to what the app actually calls.

## 4. Access-rule sweep

Findings so far: transfers and their items are branch-scoped, the payment-type public read is
gone, and only three permissive rules remain — public flags (read-only, intended),
settings locks (read-only for signed-in staff, intended), and encrypted settings (server-only,
intended). Three tables have protection switched on with no rules at all
(`cashiers`, `pin_attempts`, `terminal_recovery_secrets`), which means nothing can read them
except the server; I confirm that is deliberate and add a one-line comment rule so a future
change cannot silently open them.

I also check that a signed-in user cannot change their own role, permissions or branch, and
add the missing guards where they are not already blocked.

## 5. Tests and the closing report

New tests: branch isolation on transfers, role and branch immutability, rejection of a
desktop request to a disallowed address, rejection of malformed bridge arguments, and a check
that no key-shaped value appears in a built web bundle.

Then the report you asked for: every finding with severity, status (fixed / partly fixed /
not fixed / not a real issue), what changed, which tests cover it, files and database changes,
and what is left for you. Emergency Access stays untouched and is listed as deliberately
unchanged.

## Technical notes

Files: `electron/net.cjs` (new `assertAllowedUrl`), `electron/main.cjs` (argument schemas per
channel), `electron/preload.cjs`, `src/lib/external-supabase-config.ts`, new
`docs/secrets-rotation.md`, new tests under `src/lib/__tests__/`, plus one migration for the
role/branch immutability guards and comment rules. Verification: `bunx tsgo --noEmit`,
`bunx vitest run`, a production web build with a grep over the output, and a version bump.
