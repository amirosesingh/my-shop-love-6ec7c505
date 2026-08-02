import { Monitor, MonitorCog, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  computeUiScale,
  setUiScalePrefs,
  useUiScalePrefs,
  type UiDensity,
} from "@/lib/use-ui-scale";
import { useTheme, type ThemeChoice } from "@/lib/theme";

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
  const auto =
    typeof window === "undefined" ? 1 : computeUiScale(window.innerWidth, window.innerHeight);
  const effective = prefs.mode === "manual" ? prefs.scale : auto;
  const text = prefs.textScale;

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
            <p className="text-[10px] text-muted-foreground">
              Font size only — works independently of the display size.
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
          style={{ fontSize: `calc(0.875rem * ${effective} * ${text})` }}
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</p>
          <p className="mt-2 font-medium">Espresso Beans 250g</p>
          <p className="numeric text-muted-foreground">2 × $12.50</p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md bg-primary px-3 text-primary-foreground"
              style={{ minHeight: `calc(2.5rem * ${effective})` }}
            >
              Charge
            </button>
            <button
              className="rounded-md border border-border px-3"
              style={{ minHeight: `calc(2.5rem * ${effective})` }}
            >
              Hold
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
