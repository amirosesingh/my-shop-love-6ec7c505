/**
 * Live view of the Online/Offline switch for React screens.
 *
 * The preference itself lives in `db-mode.ts` (persisted, framework-free) so
 * the sync engine and the data gateway can read it too. This hook simply
 * re-renders whatever is on screen the moment the switch is flipped.
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
  /** What the operator chose. */
  preferred: DatabaseMode;
  /** Where data actually goes right now (a dropped line forces local). */
  effective: DatabaseMode;
  /** True while this device is set to work from the central database first. */
  onlineFirst: boolean;
  /** Wording for the status pill. */
  label: string;
  /** The phone build pins the mode; the switch is not usable there. */
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