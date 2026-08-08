import { Monitor, MonitorCog, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  computeUiScale,
  REGISTER_ZOOM_DEFAULT,
  REGISTER_ZOOM_MAX,
  REGISTER_ZOOM_MIN,
  setUiScalePrefs,
  useUiScalePrefs,
  type UiDensity,
} from "@/lib/use-ui-scale";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { ACCENT_PRESETS, DEFAULT_ACCENT, setAccent, useAccent } from "@/lib/accent";

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

const MODES: { value: "auto" | "manual"; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "Follows the window size" },
  { value: "manual", label: "Manual", hint: "Pick your own size" },
];

const DENSITIES: { value: UiDensity; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

/** Terminal-local control for font size and control height across the app. */
export function DisplayScalingSettings({ bare = false }: { bare?: boolean }) {
  const prefs = useUiScalePrefs();
  const { theme, setTheme } = useTheme();
  const accent = useAccent();
  const auto =
    typeof window === "undefined" ? 1 : computeUiScale(window.innerWidth, window.innerHeight);
  const effective = prefs.mode === "manual" ? prefs.scale : auto;
  const text = prefs.textScale;
  const registerZoom = prefs.registerZoom;

  return (
    <section className={bare ? "" : "rounded-lg border border-border bg-card p-5"}>
      {!bare && (
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MonitorCog className="size-4 text-primary" /> Display &amp; text size
        </h2>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Applies to this terminal only. Buttons never drop below a touch-safe size.
      </p>

      <div className="mt-4 space-y-1">
        <Label className="text-xs text-muted-foreground">Appearance</Label>
        <div className="flex overflow-hidden rounded-md border border-border">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={`flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs ${
                theme === t.value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs text-muted-foreground">Accent colour</Label>
        <p className="text-[11px] text-muted-foreground">
          Colours the buttons, icons and highlights on this terminal.
        </p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              aria-label={p.label}
              onClick={() => setAccent(p.hex)}
              style={{ background: p.hex }}
              className={`size-8 rounded-full border-2 ${
                accent === p.hex ? "border-foreground" : "border-transparent"
              }`}
            />
          ))}
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <input
            type="color"
            aria-label="Custom accent colour"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
          />
          <Input
            value={accent}
            aria-label="Accent colour hex"
            onChange={(e) => setAccent(e.target.value)}
            className="numeric h-9 min-w-0 text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setAccent(DEFAULT_ACCENT)}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sizing mode</Label>
            <div className="flex overflow-hidden rounded-md border border-border">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setUiScalePrefs({ mode: m.value })}
                  className={`flex-1 px-3 py-2 text-xs ${
                    prefs.mode === m.value
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                  <span className="block text-[10px] opacity-70">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Interface size</Label>
              <span className="numeric text-xs">{Math.round(effective * 100)}%</span>
            </div>
            <Slider
              aria-label="Interface size"
              min={85}
              max={150}
              step={5}
              disabled={prefs.mode !== "manual"}
              value={[Math.round(effective * 100)]}
              onValueChange={([v]) => setUiScalePrefs({ mode: "manual", scale: (v ?? 100) / 100 })}
            />
            <p className="text-[10px] text-muted-foreground">
              Buttons, inputs and overall layout density.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Text size</Label>
              <span className="numeric text-xs">{Math.round(text * 100)}%</span>
            </div>
            <Slider
              aria-label="Text size"
              min={90}
              max={160}
              step={5}
              value={[Math.round(text * 100)]}
              onValueChange={([v]) => setUiScalePrefs({ textScale: (v ?? 100) / 100 })}
            />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Input
                type="number"
                min={90}
                max={160}
                step={1}
                aria-label="Text size percentage"
                value={Math.round(text * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setUiScalePrefs({ textScale: Math.min(160, Math.max(90, v)) / 100 });
                }}
                className="numeric h-9 min-w-0 text-xs"
              />
              <span className="shrink-0 text-[11px] text-muted-foreground">% of normal</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Font size only — works independently of the display size.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Register zoom</Label>
              <span className="numeric text-xs">{Math.round(registerZoom * 100)}%</span>
            </div>
            <Slider
              aria-label="Register zoom"
              min={Math.round(REGISTER_ZOOM_MIN * 100)}
              max={Math.round(REGISTER_ZOOM_MAX * 100)}
              step={5}
              value={[Math.round(registerZoom * 100)]}
              onValueChange={([v]) =>
                setUiScalePrefs({ registerZoom: (v ?? REGISTER_ZOOM_DEFAULT * 100) / 100 })
              }
            />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Input
                type="number"
                min={Math.round(REGISTER_ZOOM_MIN * 100)}
                max={Math.round(REGISTER_ZOOM_MAX * 100)}
                step={1}
                aria-label="Register zoom percentage"
                value={Math.round(registerZoom * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  const pct = Math.min(
                    REGISTER_ZOOM_MAX * 100,
                    Math.max(REGISTER_ZOOM_MIN * 100, v),
                  );
                  setUiScalePrefs({ registerZoom: pct / 100 });
                }}
                className="numeric h-9 min-w-0 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => setUiScalePrefs({ registerZoom: REGISTER_ZOOM_DEFAULT })}
              >
                Reset
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              How much of the register screen fits at once. Saved for this terminal, so it stays
              the same each time the till is reopened.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Density</Label>
            <div className="flex overflow-hidden rounded-md border border-border">
              {DENSITIES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setUiScalePrefs({ density: d.value })}
                  className={`flex-1 px-3 py-2 text-xs ${
                    prefs.density === d.value
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setUiScalePrefs({ mode: "auto", scale: 1, textScale: 1, density: "comfortable" })
            }
          >
            Reset to automatic
          </Button>
        </div>

        <div
          className="rounded-md border border-border p-4"
          style={{ fontSize: `calc(0.875rem * ${effective})` }}
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</p>
          <p className="mt-2 font-medium">Espresso Beans 250g</p>
          <p className="numeric text-muted-foreground">2 × $12.50</p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md bg-primary px-3 text-primary-foreground"
              style={{ minHeight: `calc(40px * ${effective})` }}
            >
              Charge
            </button>
            <button
              className="rounded-md border border-border px-3"
              style={{ minHeight: `calc(40px * ${effective})` }}
            >
              Hold
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
