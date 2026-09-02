/**
 * Catch-all popup for failures nothing else handled.
 *
 * A rejected promise or a thrown handler used to leave the till looking fine
 * while the action silently did nothing. Everything that escapes now arrives
 * here and is shown as a plain-language toast.
 */
import { useEffect } from "react";

import { describeError, showNotification } from "@/lib/notify";

export function ErrorNotifier() {
  useEffect(() => {
    let last = "";
    let lastAt = 0;
    const announce = (error: unknown) => {
      const message = describeError(error, "This action");
      // The same failure can fire twice in a row; only tell the user once.
      if (message === last && Date.now() - lastAt < 4000) return;
      last = message;
      lastAt = Date.now();
      showNotification(message, "error");
    };
    const onRejection = (event: PromiseRejectionEvent) => announce(event.reason);
    const onError = (event: ErrorEvent) => announce(event.error ?? event.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}