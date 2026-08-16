/**
 * Which published columns a payload genuinely has to send.
 *
 * The database publishes every not-null column as "required", even when it
 * fills the value in itself (a default, a generated key, a trigger). Those
 * columns are safe to leave out of a payload, so they must not be reported as
 * gaps — otherwise the health screen keeps asking for fields the till is right
 * to omit.
 */
export type PublishedColumn = { description?: string; default?: unknown; format?: string };

const AUTO = /generated|identity|default|primary key/i;

export function trulyRequired(
  required: string[] | undefined,
  properties: Record<string, PublishedColumn | unknown> | undefined,
): string[] {
  const props = (properties ?? {}) as Record<string, PublishedColumn>;
  return (required ?? []).filter((col) => {
    const def = props[col];
    if (!def) return true;
    if (def.default !== undefined) return false;
    if (def.description && AUTO.test(def.description)) return false;
    return true;
  });
}
