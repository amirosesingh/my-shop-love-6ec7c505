# Member & redemption subdomains (Cloudflare)

The public coupon pages live in the same app as the POS. Two subdomains simply
point at the same deployment; the app decides what to show from the hostname
(`src/lib/coupon-hosts.ts`).

| Hostname | Landing behaviour |
| --- | --- |
| `member.luckycharmsdnbhd.com` | `/` sends visitors to `/join` (member signup) |
| `redeem.luckycharmsdnbhd.com` | `/` shows the "open your coupon link" page; serves `/claim/:slug` and `/c/:token` |
| your main POS domain | everything keeps working, including `/join`, `/claim/...`, `/c/...` |

## 1. Add the domains in Lovable

Project settings → Domains → Connect domain, once per hostname:

- `member.luckycharmsdnbhd.com`
- `redeem.luckycharmsdnbhd.com`

Type the full subdomain into the input. Because DNS is on Cloudflare, expand
**Advanced** and tick **"Domain uses Cloudflare or a similar proxy"** — that
switches verification to CNAME records, which works with proxied DNS.

## 2. Add the records in Cloudflare

In the Cloudflare dashboard for `luckycharmsdnbhd.com` → DNS → Records, add
exactly the records the Lovable dialog shows you (do not invent values):

- one `CNAME` per subdomain (`member`, `redeem`) with the target Lovable gives,
  proxy status **Proxied** (orange cloud)
- the verification `TXT` record if the dialog asks for one

Delete any old A/CNAME records for `member` or `redeem` first — conflicting
records are the usual reason verification stalls.

## 3. Wait for verification and SSL

Status goes Verifying → Setting up → Active. Propagation is usually minutes but
can take up to 72 hours. Lovable issues the certificate automatically. If you
have CAA records, make sure they allow Let's Encrypt.

## 4. Check it end to end

1. `https://member.luckycharmsdnbhd.com` → member signup form.
2. Register a phone number; if a welcome campaign is live you land on
   `https://redeem.luckycharmsdnbhd.com/c/vch_…` with the QR code.
3. In the backoffice, Customers → Coupon campaigns → copy link on a campaign:
   the copied URL should already use the `redeem.` host.
4. Scan that QR at the till — the member attaches and the discount applies.

## Notes

- Deploying the POS on a different subdomain is fine; the coupon paths work on
  every host. The `member.`/`redeem.` hosts only change what `/` does and which
  host admin-generated links use.
- If you rename the redemption host later, update it in
  `src/lib/coupon-hosts.ts` so copied links stay correct.
