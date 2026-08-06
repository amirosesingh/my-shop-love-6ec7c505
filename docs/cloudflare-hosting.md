# Hosting on Cloudflare with a private GitHub repo

The whole system runs from your own domain: the POS app and the public
member/coupon pages on a Cloudflare Worker, and every download (Windows
installer, Android APK, update feeds) from the R2 bucket behind a custom
domain. GitHub holds the private source and deploys `main` automatically.

```text
pos.luckycharmsdnbhd.com        -> Worker (app)              [Access-gated]
member.luckycharmsdnbhd.com     -> Worker, /join             [public]
redeem.luckycharmsdnbhd.com     -> Worker, /claim, /c/...    [public]
updatecms.luckycharmsdnbhd.com  -> R2 bucket "updatelccms"   [public reads]
```

## 1. One-time Cloudflare setup

1. **API token** — My Profile > API Tokens > Create Token > Custom:
   - `Account / Workers Scripts / Edit`
   - `Account / Workers R2 Storage / Edit` (only if CI uploads installers)
   - `Zone / Workers Routes / Edit` on `luckycharmsdnbhd.com`
   Copy the token once; it is never shown again.
2. **Account ID** — from the Cloudflare dashboard sidebar.
3. **R2 custom domain** — R2 > `updatelccms` > Settings > Custom domains, add
   `updatecms.luckycharmsdnbhd.com`. The desktop release script and the
   Android update feed already point at this URL, so nothing in the app
   changes. The S3 API endpoint stays private and is used only by CI uploads.
4. **Cache rules** for that hostname (Rules > Caching):
   - `*.exe`, `*.apk`, `*.zip`, `*.blockmap` -> Edge TTL 1 month
   - `latest*.json`, `*.yml` -> Bypass cache, so tills see new versions at once

## 2. GitHub secrets

Repository > Settings > Secrets and variables > Actions:

| Secret | Used by | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `deploy.yml` | Worker deploy |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy.yml` | Worker deploy |
| `VITE_SUPABASE_URL` | `deploy.yml` | Client build config |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `deploy.yml` | Client build config (publishable) |
| `VITE_SUPABASE_PROJECT_ID` | `deploy.yml` | Client build config |
| `SECURITY_ALERT_INGEST_URL` | `security.yml` | `https://pos.luckycharmsdnbhd.com/api/public/security-alerts` |
| `SECURITY_ALERT_INGEST_SECRET` | `security.yml` | Shared HMAC signing secret (same value saved in the app) |
| `R2_*` | release workflows | Existing installer/APK uploads |

Server-only runtime values go to the Worker, not the repo:

```sh
bunx wrangler secret put SECURITY_ALERT_INGEST_SECRET
```

## 3. Deploys

Push to `main` -> `.github/workflows/deploy.yml` runs tests, lint, a
Cloudflare-targeted build (`CLOUDFLARE_BUILD=1`), then `wrangler deploy`.
A concurrency group prevents overlapping deploys. Manual redeploys are
available from the Actions tab (`workflow_dispatch`).

Local equivalent:

```sh
CLOUDFLARE_BUILD=1 bun run build
bunx wrangler deploy --config wrangler.jsonc
```

## 4. Zero Trust: public storefront, gated back office

Cloudflare One > Access > Applications.

**Bypass (no login) — create these first, order matters:**

| Application | Path |
| --- | --- |
| Member signup host | `member.luckycharmsdnbhd.com` (all paths) |
| Redemption host | `redeem.luckycharmsdnbhd.com` (all paths) |
| Public storefront | `pos.luckycharmsdnbhd.com/join`, `/claim/*`, `/c/*` |
| Customer display | `pos.luckycharmsdnbhd.com/display` |
| Machine callers | `pos.luckycharmsdnbhd.com/api/public/*` |
| Terminal activation | `pos.luckycharmsdnbhd.com/activate*` |

Policy for each: Action **Bypass**, Include **Everyone**.
`/api/public/*` verifies its own HMAC signature, so bypassing Access there is
safe and required for CI reporting to work.

**Gated — one application covering everything else:**

- Application domain: `pos.luckycharmsdnbhd.com`
- Policy 1 (Allow): Include *Emails ending in* `@yourdomain.com`
- Policy 2 (Allow): Include *IP ranges* = each shop's fixed line

Register, reports, analytics and settings then never render for anyone outside
those rules. The PIN sign-in, role permissions and terminal activation inside
the app are unchanged — Access is an extra outer door.

### Windows tills and Android terminals

They sit behind Access too. Pick one:

- **IP policy** (simplest) — add each shop's static IP to the gated policy.
- **Service token** — Access > Service Auth > create a token, then send
  `CF-Access-Client-Id` and `CF-Access-Client-Secret` on requests from the
  Electron and Capacitor builds, and add a policy with Action *Service Auth*.
- **Device login** — a shop on a changing connection signs in to Access once
  per device; the session cookie lasts as long as the app session duration you
  configure.

## 5. Repository hardening

Settings > Branches > add a rule for `main`:

- Require a pull request before merging
- Require status check **Security checks / guardrails**
- Block force pushes and deletions

Settings > Code security:

- Secret scanning: **on**
- Push protection: **on**
- Dependabot alerts and security updates: **on** (`.github/dependabot.yml`)

Settings > Actions > General:

- Workflow permissions: **Read repository contents** by default. The desktop
  and Android release workflows that push version bumps declare their own
  `permissions: contents: write`.

`.env`, `dist`, `.output`, `.wrangler` and `.dev.vars` are already ignored, so
no key can reach the repo by accident.

## 6. Checklist

- [ ] R2 custom domain live at `updatecms.luckycharmsdnbhd.com`
- [ ] Cache rules added for installers and update manifests
- [ ] Cloudflare API token + account ID in GitHub secrets
- [ ] First deploy green on Actions
- [ ] Bypass applications created before the gated one
- [ ] Gated application allows staff email domain and shop IPs
- [ ] Tills reach the app (IP policy or service token)
- [ ] Branch protection, secret scanning and push protection on
- [ ] Security alert ingest URL + secret saved in GitHub and in the app