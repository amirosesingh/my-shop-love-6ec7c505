/**
 * One hierarchical setting row: label, sync-with-parent switch, the input and
 * a badge saying where the current value comes from.
 */
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SOURCE_LABEL,
  type ResolvedSetting,
  type SettingDef,
  type SettingScope,
  type SettingValue,
} from "@/lib/settings-scope";

export function InheritedField({
  def,
  state,
  scope,
  disabled,
  onValue,
  onOverride,
}: {
  def: SettingDef;
  state: ResolvedSetting;
  scope: SettingScope;
  disabled?: boolean;
  onValue: (value: SettingValue) => void;
  onOverride: (on: boolean) => void;
}) {
  const isGlobal = scope === "GLOBAL";
  const locked = !isGlobal && !state.isOverridden;
  const inherited = state.parentValue;
  const shown = locked && inherited !== null ? inherited : state.value;

  const badgeVariant =
    state.source === "BRANCH" ? "default" : state.source === "CLUSTER" ? "secondary" : "outline";

  return (
    <div className="grid gap-2 border-t border-border/60 py-3 first:border-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <Label className="text-sm">{def.label}</Label>
        <p className="text-xs text-muted-foreground">{def.blurb}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant={badgeVariant} className="text-[10px]">
            {isGlobal ? "Global value" : SOURCE_LABEL[state.source]}
          </Badge>
          {locked && inherited !== null && (
            <span className="text-[10px] text-muted-foreground">
              Inherited value: <span className="numeric">{String(inherited)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:justify-end">
        {!isGlobal && (
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Switch
              aria-label={`Override ${def.label}`}
              disabled={disabled}
              checked={state.isOverridden}
              onCheckedChange={onOverride}
            />
            {state.isOverridden ? "Custom" : "Sync"}
          </label>
        )}

        {def.kind === "boolean" ? (
          <Switch
            aria-label={def.label}
            disabled={disabled || locked}
            checked={Boolean(shown)}
            onCheckedChange={(v) => onValue(v)}
          />
        ) : (
          <Input
            aria-label={def.label}
            type={def.secret ? "password" : "text"}
            inputMode={def.kind === "number" ? "decimal" : "text"}
            className={def.kind === "number" ? "numeric h-9 w-28" : "h-9 w-52"}
            disabled={disabled || locked}
            value={String(shown ?? "")}
            onChange={(e) =>
              onValue(def.kind === "number" ? Number(e.target.value) || 0 : e.target.value)
            }
          />
        )}
      </div>
    </div>
  );
}