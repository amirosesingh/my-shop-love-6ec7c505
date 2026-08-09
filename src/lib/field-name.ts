/**
 * Chrome's autofill heuristics warn for any text field rendered without an
 * `id` or `name`. Most screens render inputs with only a label or aria-label,
 * so the shared primitives derive a stable identifier here instead of every
 * call site having to spell one out.
 */
export function slugifyFieldName(source?: string | number | readonly string[]): string {
  if (typeof source !== "string") return "";
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Picks the caller's id/name when given, otherwise a label/placeholder slug, otherwise the React id. */
export function resolveFieldIdentity({
  id,
  name,
  ariaLabel,
  placeholder,
  fallbackId,
}: {
  id?: string;
  name?: string;
  ariaLabel?: string;
  placeholder?: string | number | readonly string[];
  fallbackId: string;
}): { id: string; name: string } {
  const slug = slugifyFieldName(ariaLabel) || slugifyFieldName(placeholder);
  const safeFallback = `field-${fallbackId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const resolvedName = name ?? id ?? (slug ? `${slug}-${safeFallback}` : safeFallback);
  const resolvedId = id ?? resolvedName;
  return { id: resolvedId, name: resolvedName };
}
