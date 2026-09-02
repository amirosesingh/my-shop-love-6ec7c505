/**
 * "Sync behaviour" — the tuning knobs for the background worker.
 *
 * Everything here is safe to touch: each value is clamped to a sensible range
 * before it is stored, so a typo can never stop the till from syncing. Changes
 * apply straight away — the worker rebuilds its timers when the settings
 * change, no restart needed.
 */
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showNotification } from "@/lib/notify";
import {
  DEFAULT_SYNC_CONFIG,
  resetSyncConfig,
  setSyncConfig,
  subscribeSyncConfig,
  syncConfig,
  type SyncConfig,
} from "@/lib/sync-config";

type Field = {
  key: keyof SyncConfig;
  label: string;
  hint: string;
  /** Shown in seconds instead of milliseconds when true. */
  seconds?: boolean;
  min: number;
  max: number;
};

const FIELDS: Field[] = [
  {
    key: "intervalMs",
    label: "Check for changes every",
    hint: "Seconds between two background passes (5–300).",
    seconds: true,
    min: 5,
    max: 300,
  },
  {
    key: "batchSize",
    label: "Changes sent per pass",
    hint: "Larger is faster on a good line, smaller is gentler on a weak one (1–500).",
    min: 1,
    max: 500,
  },
  {
    key: "heartbeatMs",
    label: "Connection check every",
    hint: "How often the app confirms the central database is reachable (5–300 seconds).",
    seconds: true,
    min: 5,
    max: 300,
  },
  {
    key: "maxAttempts",
    label: "Retries before parking a change",
    hint: "After this many failures the change waits in the parked list for a person (1–50).",
    min: 1,
    max: 50,
  },
  {
    key: "maxBackoffMs",
    label: "Longest wait between retries",
    hint: "Retries start at 5 seconds and triple, up to this many seconds (30–1800).",
    seconds: true,
    min: 30,
    max: 1800,
  },
];

const toDisplay = (f: Field, cfg: SyncConfig) =>
  String(f.seconds ? Math.round(cfg[f.key] / 1000) : cfg[f.key]);

export function SyncBehaviourSettings() {
  const [cfg, setCfg] = useState<SyncConfig>(syncConfig);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, toDisplay(f, syncConfig())])),
  );

  useEffect(() => {
    const off = subscribeSyncConfig(() => {
      const next = syncConfig();
      setCfg(next);
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, toDisplay(f, next)])));
    });
    return () => off();
  }, []);

  const commit = (f: Field) => {
    const raw = Number(draft[f.key]);
    if (!Number.isFinite(raw)) {
      setDraft((d) => ({ ...d, [f.key]: toDisplay(f, cfg) }));
      return;
    }
    const value = f.seconds ? raw * 1000 : raw;
    const saved = setSyncConfig({ [f.key]: value } as Partial<SyncConfig>);
    setCfg(saved);
    setDraft((d) => ({ ...d, [f.key]: toDisplay(f, saved) }));
    if (saved[f.key] !== Math.round(value)) {
      showNotification("Adjusted to the nearest allowed value", "info");
    }
  };

  const changed = FIELDS.some((f) => cfg[f.key] !== DEFAULT_SYNC_CONFIG[f.key]);

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Sync behaviour</p>
          <p className="text-xs text-muted-foreground">
            How often this device talks to the central database, and how hard it tries when a change
            fails. Changes apply immediately.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!changed}
          onClick={() => {
            const next = resetSyncConfig();
            setCfg(next);
            setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, toDisplay(f, next)])));
            showNotification("Recommended settings restored", "success");
          }}
        >
          <RotateCcw className="mr-1.5 size-3.5" /> Reset
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`sync-${f.key}`} className="text-xs">
              {f.label}
              {f.seconds ? " (seconds)" : ""}
            </Label>
            <Input
              id={`sync-${f.key}`}
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              value={draft[f.key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onBlur={() => commit(f)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            <p className="text-[11px] text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
