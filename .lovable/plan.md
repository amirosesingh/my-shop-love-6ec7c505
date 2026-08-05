# Show each public domain separately in System Integration

## What's happening

The health check tests both public domains together and reports one combined line ("Public subdomains — 1 of 2 public domains did not respond"), so it never says *which* one is down.

From the live network log:
- `https://member.luckycharmsdnbhd.com` — responds (opaque no-cors reply, so it is reachable)
- `https://redeem.luckycharmsdnbhd.com` — `Failed to fetch` on every attempt, meaning the hostname is not resolving/serving yet

So the failing one is the **redeem** subdomain. That is a DNS/domain-connection issue outside the app code: `redeem.luckycharmsdnbhd.com` has to be added in Project Settings → Domains (with the Cloudflare/proxy option ticked) and given the CNAME + TXT records Lovable shows, before any page will open there.

## What I'll change in the app

1. **Per-domain checks** in `src/lib/system-health.ts`
   - Split the single `subdomains` check into one check per configured domain (`Member domain` and `Redeem domain`), each with its own state, latency, hostname in the label, and its own error-log entry.
   - Normalise the URL first (add `https://` if the setting was saved as a bare hostname) so a badly typed setting doesn't look like an outage.
   - Detail text names the host and the likely cause, e.g. "redeem.luckycharmsdnbhd.com did not respond — check the domain is connected and DNS records are live."

2. **Top-bar pill popover** (`SystemStatusPill.tsx`)
   - Shows both domain rows separately, so a glance tells you which subdomain is broken.

3. **System status page** (`src/routes/settings.system.tsx`)
   - Status dashboard lists each domain as its own card with a "Open page" link to test it in a browser tab.
   - When a domain is down, show a short inline hint with the fix steps (connect the domain, add the CNAME/TXT, wait for verification) and keep the existing copy-DNS-instructions dialog.

## Technical notes

- The browser check uses `fetch(..., { mode: "no-cors" })`; an opaque response counts as reachable, a thrown `TypeError` counts as down. This is the only signal available client-side and can also fail if the whole terminal is offline, so if `navigator.onLine` is false the domains are reported as "unknown — terminal offline" rather than down.
- Check IDs become `domain:<hostname>` so multiple domains can coexist in `ServiceCheck[]`; `overallState` and the error log keep working unchanged.
