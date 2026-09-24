type NamedRecord = { id: string; name: string };
type ReferencedSale = { id: string; receiptNo: string };

export type FriendlyReferences = {
  stores?: NamedRecord[];
  products?: NamedRecord[];
  members?: NamedRecord[];
  sales?: ReferencedSale[];
};

/** Replace identifiers already known to the client with the names users recognise. */
export function humanizeText(value: string, refs: FriendlyReferences): string {
  let result = value;
  const replacements = [
    ...(refs.stores ?? []).map((row) => [row.id, row.name] as const),
    ...(refs.products ?? []).map((row) => [row.id, row.name] as const),
    ...(refs.members ?? []).map((row) => [row.id, row.name] as const),
    ...(refs.sales ?? []).map((row) => [row.id, row.receiptNo] as const),
  ]
    .filter(([id, name]) => id && name && id !== name)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [id, name] of replacements) result = result.split(id).join(name);
  return result;
}

export function friendlyReference(id: string | null | undefined, refs: FriendlyReferences): string {
  if (!id) return "—";
  return (
    refs.stores?.find((row) => row.id === id)?.name ??
    refs.products?.find((row) => row.id === id)?.name ??
    refs.members?.find((row) => row.id === id)?.name ??
    refs.sales?.find((row) => row.id === id)?.receiptNo ??
    "Related record"
  );
}
