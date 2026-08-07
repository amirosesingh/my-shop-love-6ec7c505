/**
 * Public-facing subdomains for member signup and coupon redemption.
 *
 * Both subdomains serve the same build; only the landing path differs, so the
 * pages also work on the main domain (handy for testing and for the preview).
 */
import { useEffect } from "react";
import { loadPublicFlags } from "./public-flags";

export const MEMBER_HOST = "member.luckycharmsdnbhd.com";
export const REDEEM_HOST = "redeem.luckycharmsdnbhd.com";

const origin = (host: string) =>
  typeof window !== "undefined" && window.location.hostname === host
    ? window.location.origin
    : `https://${host}`;

/** Public link a customer opens to register as a member. */
export const joinUrl = () => `${origin(MEMBER_HOST)}/join`;

/** Public link that hands out a voucher for a campaign. */
export const claimUrl = (slug: string) => `${origin(REDEEM_HOST)}/claim/${slug}`;

/** Personal voucher link, the one printed as a QR code. */
export const voucherUrl = (token: string) => `${origin(REDEEM_HOST)}/c/${token}`;

/**
 * On the member / redeem subdomains the site root is a marketing dead end, so
 * send visitors straight to the signup form.
 */
export function usePublicHostLanding() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    if (window.location.pathname !== "/") return;
    if (host !== MEMBER_HOST && host !== REDEEM_HOST) return;
    void loadPublicFlags().then((flags) => {
      const on = host === MEMBER_HOST ? flags.member : flags.redeem;
      if (on) window.location.replace("/join");
    });
  }, []);
}
