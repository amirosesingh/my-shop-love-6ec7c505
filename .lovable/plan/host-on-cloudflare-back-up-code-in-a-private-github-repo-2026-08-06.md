# Host on Cloudflare, back up code in a private GitHub repo

Goal: the POS web app, the public member/coupon pages, and every download
(Windows installer, Android APK, update feeds) served from your own Cloudflare
domain, deployed automatically from `main`, with the back office locked behind
Cloudflare Access and the repository kept clean of secrets.

## What lives where

```text
pos.luckycharmsdnbhd.com        -> Cloudflare Worker (the app)   [Access-gated]
member.luckycharmsdnbhd.com     -> same Worker, /join            [public]
redeem.luckycharmsdnbhd.com     -> same Worker, /claim, /c/...   [public]
updatecms.luckycharmsdnbhd.com  -> R2 bucket "updatelccms"       [public reads]
GitHub (private)                -> source of truth; push to main deploys
```

The app already builds for Cloudflare by default, so no build rewrite is
needed — only the deploy wiring, the domain routing, and the gate.

## 1. Cloudflare deployment from main

- Add a Worker config (`wrangler.jsonc`) declaring the app name, the entry the
  build already produces, static assets, and the three custom domains above.
- Add a `deploy.yml` workflow: on push to `main` it installs with Bun, runs
  lint, tests and build, then deploys with Wrangler. It runs only after the
  existing security workflow passes, so a failing guardrail cannot ship.
- Deploys use a scoped Cloudflare API token (Workers edit plus write on that
  one R2 bucket) and the account ID, both stored as GitHub Actions secrets.
  No token ever lands in the repo.
- A concurrency group so two pushes can never deploy over each other.

## 2. Downloads on your own domain

- Point `updatecms.luckycharmsdnbhd.com` at the `updatelccms` R2 bucket as a
  public custom domain, cached at the edge.
- That is already the URL the desktop release script and the Android update
  feed use, so installers and over-the-air updates keep working unchanged; the
  private R2 API endpoint stays for CI uploads only.
- Add cache rules: installers and APKs cached long, `latest.json` and the
  update manifests set to no-cache so tills see a new version immediately.

## 3. Public storefront, gated back office

Cloudflare Zero Trust rules, evaluated before the app even loads:

- **Public:** `member.*` and `redeem.*` in full, plus `/join`, `/claim/*`,
  `/c/*` and the customer display screen on the main domain.
- **Public for machines:** `/api/public/*` — the security alert ingest and any
  webhook, which authenticate themselves by signature.
- **Gated:** everything else — register, reports, analytics, settings, admin.
  Policy allows your staff email domain plus your shop IP ranges; nobody else
  even reaches the sign-in screen.

Your PIN sign-in, role permissions and terminal activation stay exactly as
they are. Access is an extra outer door, not a replacement.

**Trade-off to settle during setup:** Windows tills and Android terminals sit
behind Access too. Cleanest is a service token baked into the Electron and
Capacitor builds, or an IP policy covering each shop's fixed line. A shop on a
changing connection needs a one-time Access login per device.

## 4. Hardening the private repository

- Branch protection on `main`: no force pushes, no deletion, security workflow
  must pass before merge.
- Secret scanning and push protection on, so a key can never be committed.
- Confirm `.env` and build output stay ignored; runtime keys move to Worker
  secrets and GitHub Actions secrets.
- Default workflow token read-only; the release workflows that push version
  bumps keep write access explicitly.
- Dependabot limited to security updates, so patches arrive without noise.

## 5. Loose ends this closes

- The security alert ingest still needs its shared signing secret plus the
  ingest URL as GitHub secrets — once Cloudflare is live that URL becomes
  `https://pos.luckycharmsdnbhd.com/api/public/security-alerts`.
- The nightly database posture check keeps running in the backend regardless
  of where the site is hosted.

## Technical notes

- `vite.config.ts` already targets Cloudflare for the browser build; the
  desktop and Android variants override the target and stay untouched.
- Deploy workflow needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in
  GitHub Actions secrets; the existing R2 upload keeps its own R2 secrets.
- `src/lib/coupon-hosts.ts` already routes the `member.` and `redeem.` hosts,
  so the multi-domain Worker mapping matches the code as written.
- Server-side values (backend URL, publishable key, ingest secret) become
  Worker secrets, never `VITE_`-prefixed.
- Nothing about the database changes; row-level rules stay the security floor
  even if a request ever slips past Access.

## What I need from you at setup time

Your Cloudflare account ID, the scoped API token, and which email domain or IP
ranges Access should allow. I add the config and workflows; you paste the two
secrets into GitHub and confirm the Zero Trust policy.