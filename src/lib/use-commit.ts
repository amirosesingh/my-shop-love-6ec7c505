import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { commitLabel, type CommitTarget } from "@/core/api/pos-db";

/**
 * Runs an action that must be stored before anything else happens.
 *
 * While it is pending the caller can disable its button, so a second event can
 * never start before the first one is safely saved. Failures leave the screen
 * untouched and explain what went wrong.
 */
export function useCommit() {
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async <T,>(
      label: string,
      work: () => Promise<{ target: CommitTarget; result: T } | CommitTarget>,
      after?: (result: T | undefined, target: CommitTarget) => void | Promise<void>,
    ): Promise<boolean> => {
      if (busy.current) {
        toast.info("Please wait — the previous action is still being saved");
        return false;
      }
      busy.current = true;
      setPending(true);
      setSaved(null);
      try {
        const outcome = await work();
        const target = typeof outcome === "string" ? outcome : outcome.target;
        const result = typeof outcome === "string" ? undefined : outcome.result;
        const note = commitLabel(target);
        setSaved(note);
        toast.success(`${label} — ${note.toLowerCase()}`);
        await after?.(result, target);
        return true;
      } catch (e) {
        const message = (e as { message?: string })?.message ?? String(e);
        toast.error(`${label} was not saved`, { description: message });
        return false;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [],
  );

  return { run, pending, saved };
}
