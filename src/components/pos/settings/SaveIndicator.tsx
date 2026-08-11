/**
 * One consistent "is my work stored?" read-out for every settings page.
 * Pages own their save logic; this only renders the state.
 */
import { Check, Loader2, TriangleAlert } from "lucide-react";

type Props = {
  dirty: boolean;
  saving: boolean;
  savedAt?: string | null;
  error?: string;
  className?: string;
};

export function SaveIndicator({ dirty, saving, savedAt, error, className = "" }: Props) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}
    >
      {saving ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Saving…
        </>
      ) : error ? (
        <>
          <TriangleAlert className="size-4 text-destructive" />
          <span className="text-destructive">Could not save — {error}</span>
        </>
      ) : dirty ? (
        <>
          <TriangleAlert className="size-4 text-amber-500" /> Unsaved changes
        </>
      ) : (
        <>
          <Check className="size-4 text-emerald-500" />
          {savedAt ? `All changes saved · ${savedAt}` : "All changes saved"}
        </>
      )}
    </span>
  );
}