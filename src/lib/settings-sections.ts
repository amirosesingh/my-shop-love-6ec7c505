/**
 * Which settings belong to which scopable block.
 *
 * Every configuration block can either follow the global default or be
 * overridden for one branch. A block is described by the dotted paths it owns
 * inside `AppSettings`, so a write can be routed to the right place without
 * every settings page having to know about scopes.
 */
import type { AppSettings } from "@/core/types/pos-types";

export type SettingsSectionId =
  | "tax"
  | "review"
  | "hours"
  | "receiptIdentity"
  | "receiptLayout"
  | "payment"
  | "whatsapp"
  | "booking"
  | "categoryMap"
  | "integrations"
  | "visibility";

export type SettingsSectionDef = {
  id: SettingsSectionId;
  label: string;
  blurb: string;
  /** Dotted paths inside AppSettings owned by this block. */
  paths: string[];
  /** Blocks head office normally keeps to itself. */
  lockedByDefault: boolean;
};

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: "tax",
    label: "Tax policy",
    blurb: "Rate, inclusive/exclusive mode and whether tax is charged at all.",
    paths: ["tax"],
    lockedByDefault: true,
  },
  {
    id: "review",
    label: "Audit & review thresholds",
    blurb: "Void, refund and discount limits that flag a cashier for review.",
    paths: ["review"],
    lockedByDefault: true,
  },
  {
    id: "visibility",
    label: "Screen visibility",
    blurb: "Which roles can see which elements of the till.",
    paths: ["visibility"],
    lockedByDefault: true,
  },
  {
    id: "hours",
    label: "Trading hours",
    blurb: "Day start, day end and shift length limits.",
    paths: ["hours"],
    lockedByDefault: false,
  },
  {
    id: "receiptIdentity",
    label: "Receipt header & footer",
    blurb: "Branch address, phone, tax numbers and claim policy wording.",
    paths: [
      "receipt.companyName",
      "receipt.taxNumber",
      "receipt.regNumber",
      "receipt.phone",
      "receipt.website",
      "receipt.headerText",
      "receipt.footerText",
      "receipt.customLines",
      "receipt.bookingSlip",
      "receipt.qr",
    ],
    lockedByDefault: false,
  },
  {
    id: "receiptLayout",
    label: "Receipt layout",
    blurb: "Paper size, typography and what is printed on the slip.",
    paths: ["receipt"],
    lockedByDefault: false,
  },
  {
    id: "payment",
    label: "Payment details",
    blurb: "Bank, e-wallet and transfer QR shown to the customer.",
    paths: ["payment"],
    lockedByDefault: false,
  },
  {
    id: "whatsapp",
    label: "WhatsApp messaging",
    blurb: "Outbound bill and job notifications.",
    paths: ["whatsapp"],
    lockedByDefault: false,
  },
  {
    id: "booking",
    label: "Booking & labour rules",
    blurb: "Base labour fee, service list and the mandatory-customer rule.",
    paths: [
      "integrations.requireBookingCustomer",
      "integrations.baseLaborFee",
      "integrations.serviceTypes",
      "integrations.useServiceTypes",
      "integrations.allowCustomServiceType",
    ],
    lockedByDefault: false,
  },
  {
    id: "categoryMap",
    label: "Category & inventory mapping",
    blurb: "Which catalogue categories intake lines are booked against.",
    paths: ["integrations.categoryMap"],
    lockedByDefault: false,
  },
  {
    id: "integrations",
    label: "System & integrations",
    blurb: "Domains, approval switches, numbering and regional formats.",
    paths: ["integrations"],
    lockedByDefault: false,
  },
];

export const SECTION_BY_ID: Record<string, SettingsSectionDef> = Object.fromEntries(
  SETTINGS_SECTIONS.map((s) => [s.id, s]),
);

/** Longest matching path wins, so "integrations.baseLaborFee" beats "integrations". */
export function sectionOfPath(path: string): SettingsSectionDef | null {
  let best: SettingsSectionDef | null = null;
  let bestLen = -1;
  for (const section of SETTINGS_SECTIONS) {
    for (const owned of section.paths) {
      if ((path === owned || path.startsWith(`${owned}.`)) && owned.length > bestLen) {
        best = section;
        bestLen = owned.length;
      }
    }
  }
  return best;
}

type Bag = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Bag =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!isPlainObject(acc)) return undefined;
    return acc[key];
  }, source);
}

/** Immutably place `value` at a dotted path, creating the objects on the way. */
export function setPath<T extends Bag>(source: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  if (!head) return source;
  if (!rest.length) return { ...source, [head]: value };
  const child = isPlainObject(source[head]) ? (source[head] as Bag) : {};
  return { ...source, [head]: setPath(child, rest.join("."), value) };
}

/** Deep-merge an override patch over the global settings. */
export function mergePatch<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  if (!isPlainObject(base)) return patch as T;
  const out: Bag = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) ? mergePatch(out[key], value) : value;
  }
  return out as T;
}

/** Snapshot the values a section owns, ready to become a branch override. */
export function pickSection(settings: AppSettings, section: SettingsSectionDef): Bag {
  let patch: Bag = {};
  for (const path of section.paths) {
    const value = getPath(settings, path);
    if (value === undefined) continue;
    patch = setPath(patch, path, value);
  }
  return patch;
}

/** Every leaf path a settings patch touches, one level inside each block. */
export function patchPaths(patch: Bag, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && !prefix) paths.push(...patchPaths(value as Bag, path));
    else paths.push(path);
  }
  return paths;
}