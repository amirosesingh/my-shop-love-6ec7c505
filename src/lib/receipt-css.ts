/**
 * Scoped CSS for printed slips.
 *
 * An operator may style their own receipt, but that stylesheet is only ever
 * evaluated inside the print document, and even there it is rewritten so it
 * cannot reach outside the receipt body, pull in remote resources or change the
 * paper geometry the printer depends on.
 */

/** Root element every custom rule is anchored to inside the print document. */
export const RECEIPT_SCOPE = ".rcpt-custom";

const BANNED_AT_RULES = /@(import|charset|namespace|font-face|page)[^;{]*(;|\{[^}]*\})/gi;
const BANNED_VALUES = /(url\s*\(|expression\s*\(|javascript:|behavior\s*:|@supports)/gi;
// Geometry belongs to the paper size, never to the custom sheet.
const BANNED_PROPS = /(^|;)\s*(position|width|max-width|min-width|left|right|top|bottom|z-index|content)\s*:[^;]*/gi;

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const scopeSelector = (selector: string) =>
  selector
    .split(",")
    .map((part) => {
      const s = part.trim();
      if (!s) return "";
      if (/^(html|body|:root)$/i.test(s)) return RECEIPT_SCOPE;
      if (s.startsWith(RECEIPT_SCOPE)) return s;
      return `${RECEIPT_SCOPE} ${s}`;
    })
    .filter(Boolean)
    .join(", ");

const cleanBody = (body: string) =>
  body.replace(BANNED_VALUES, "").replace(BANNED_PROPS, "$1").replace(/!\s*important/gi, "");

/**
 * Turn an operator's stylesheet into a safe, scoped one. Returns "" when
 * nothing usable is left.
 */
export function scopeReceiptCss(css: string | undefined | null): string {
  if (!css || !css.trim()) return "";
  const cleaned = stripComments(css).replace(/<\/?[a-z][^>]*>/gi, "").replace(BANNED_AT_RULES, "");
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(cleaned))) {
    const rawSelector = (match[1] ?? "").trim();
    const body = cleanBody(match[2] ?? "").trim();
    if (!body) continue;
    // Bare at-rules (media queries and friends) keep their own block, with the
    // selectors inside scoped by the recursive pass.
    if (rawSelector.startsWith("@")) continue;
    const selector = scopeSelector(rawSelector);
    if (!selector) continue;
    out.push(`${selector} { ${body} }`);
  }
  return out.join("\n");
}

/** Problems worth telling the operator about before they save. */
export function receiptCssWarnings(css: string | undefined | null): string[] {
  if (!css || !css.trim()) return [];
  const warnings: string[] = [];
  if (/@import/i.test(css)) warnings.push("@import is removed — remote stylesheets cannot be loaded.");
  if (/url\s*\(/i.test(css)) warnings.push("url(...) is removed — external images and fonts cannot be loaded.");
  if (/(^|[\s;{])(position|width|max-width)\s*:/i.test(css))
    warnings.push("Layout width and position are fixed by the paper size and are ignored.");
  if (/@media|@supports/i.test(css)) warnings.push("At-rule blocks are dropped; write plain rules instead.");
  return warnings;
}
