/**
 * Public-facing subdomains for member signup and coupon redemption.
 *
 * The hosts are NOT hardcoded: an administrator sets them in
 * System & Integrations and they are applied here at runtime. Until settings
 * have loaded (or when nothing is configured) the current origin is used, so
 * the pages always work on the main domain and in the preview.
 */
import { useEffect, useState } from "react";
import { loadPublicFlags } from "./public-flags";

type PublicHosts = { member: string; redeem: string };

let hosts: PublicHosts = { member: "", redeem: "" };
const listeners = new Set<() => void>();

/** Strip scheme, path and trailing slash so only the hostname remains. */
export function toHostname(value: string): string {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  const stripped = v.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  return stripped.replace(/\/+$/, "");
}

/** Called whenever settings load or an admin saves new domains. */
export function setPublicHosts(memberDomain: string, redeemDomain: string) {
  const next = { member: toHostname(memberDomain), redeem: toHostname(redeemDomain) };
  if (next.member === hosts.member && next.redeem === hosts.redeem) return;
  hosts = next;
  listeners.forEach((l) => l());
}

export const publicHosts = (): PublicHosts => hosts;
export const memberHost = () => hosts.member;
export const redeemHost = () => hosts.redeem;

const fallbackOrigin = () =>
  typeof window !== "undefined" ? window.location.origin : "";

const origin = (host: string) => {
  if (!host) return fallbackOrigin();
  if (typeof window !== "undefined" && window.location.hostname === host) {
    return window.location.origin;
  }
  return `https://${host}`;
};

/** Public link a customer opens to register as a member. */
export const joinUrl = () => `${origin(hosts.member)}/join`;

/** Public link that hands out a voucher for a campaign. */
export const claimUrl = (slug: string) => `${origin(hosts.redeem)}/claim/${slug}`;

/** Personal voucher link, the one printed as a QR code. */
export const voucherUrl = (token: string) => `${origin(hosts.redeem)}/c/${token}`;

/** Re-renders a component when an admin changes the configured domains. */
export function usePublicHosts(): PublicHosts {
  const [value, setValue] = useState(hosts);
  useEffect(() => {
    const l = () => setValue(hosts);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return value;
}

/**
 * On the member / redeem subdomains the site root is a marketing dead end, so
 * send visitors straight to the signup form.
 */
export function usePublicHostLanding() {
  const { member, redeem } = usePublicHosts();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    if (window.location.pathname !== "/") return;
    if (!host || (host !== member && host !== redeem)) return;
    void loadPublicFlags().then((flags) => {
      const on = host === member ? flags.member : flags.redeem;
      if (on) window.location.replace("/join");
    });
  }, [member, redeem]);
}
