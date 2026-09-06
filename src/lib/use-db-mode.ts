/**
 * Live view of the platform-pinned database mode for React screens.
 *
 * The preference itself lives in `db-mode.ts` (persisted, framework-free) so
 * the sync engine and the data gateway can read it too. This hook simply
 * re-renders status changes without letting an operator weaken the platform's
 * durability policy.
 */
import { useEffect, useState } from "react";
import {
  databaseModeLabel,
  databaseModeLocked,
  effectiveDatabaseMode,
  preferredDatabaseMode,
  setPreferredDatabaseMode,
  subscribeDatabaseMode,
  type DatabaseMode,
} from "@/core/local-db/db-mode";

export type DatabaseModeView = {
  /** The mode fixed by this platform's capabilities. */
  preferred: DatabaseMode;
  /** Where data actually goes right now (a dropped line forces local). */
  effective: DatabaseMode;
  /** True only on web and Android, which always work centrally. */
  onlineFirst: boolean;
  /** Wording for the status pill. */
  label: string;
  /** Every platform pins its supported mode. */
  locked: boolean;
  setMode: (mode: DatabaseMode) => void;
};

export function useDatabaseMode(): DatabaseModeView {
  const [, force] = useState(0);
  useEffect(() => subscribeDatabaseMode(() => force((n) => n + 1)), []);
  const preferred = preferredDatabaseMode();
  return {
    preferred,
    effective: effectiveDatabaseMode(),
    onlineFirst: preferred === "online",
    label: databaseModeLabel(),
    locked: databaseModeLocked(),
    setMode: setPreferredDatabaseMode,
  };
}
