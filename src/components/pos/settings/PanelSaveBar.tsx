/**
 * Save controls for settings panels that render outside <SettingsFrame>
 * (the slide-over drawer). Same save path, same read-out as the pages.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { SaveIndicator } from "@/components/pos/settings/SaveIndicator";
import { Button } from "@/components/ui/button";
import { db } from "@/core/api/pos-db";
import { usePos } from "@/lib/pos-store";

export function usePanelSave() {
  const { state, updateSettings } = usePos();
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(state.settings));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(state.settings) !== snapshot;
  const settingsRef = useRef(state.settings);
  settingsRef.current = state.settings;

  // A fresh copy from another device (realtime) becomes the new baseline.
  useEffect(() => {
    if (!dirty) setSnapshot(JSON.stringify(state.settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await db.saveSettingsNow(settingsRef.current);
      setSnapshot(JSON.stringify(settingsRef.current));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast.success("Settings saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not reach the database";
      setError(message);
      toast.error("Could not save settings", { description: message });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    updateSettings(JSON.parse(snapshot));
    setError("");
    toast.info("Changes discarded");
  };

  return { dirty, saving, savedAt, error, save, discard };
}

export function PanelSaveBar() {
  const { dirty, saving, savedAt, error, save, discard } = usePanelSave();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:flex sm:justify-between">
      <SaveIndicator dirty={dirty} saving={saving} savedAt={savedAt} error={error} className="min-w-0" />
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" onClick={discard} disabled={!dirty || saving}>
          <RotateCcw className="mr-1 size-3.5" /> Discard
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}
