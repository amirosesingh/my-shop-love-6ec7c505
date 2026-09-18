/**
 * A button an admin created in the Feature Hub. It looks up its icon by name
 * and fires an entry from the register action registry, so the underlying
 * feature is reached exactly as the built-in control would reach it.
 */
import { ActionButton } from "@/platforms/web/components/pos/ActionButton";
import { ACTION_BY_ID, useRegisterActions } from "@/lib/register-actions";
import type { CustomButtonSpec } from "@/lib/register-layout";
import { CUSTOM_ICON_MAP, fallbackCustomIcon } from "./custom-icons";

export function CustomActionButton({ spec }: { spec: CustomButtonSpec }) {
  const { run, can } = useRegisterActions();
  const Icon = CUSTOM_ICON_MAP[spec.icon] ?? fallbackCustomIcon;
  const def = ACTION_BY_ID[spec.action];
  const available = can(spec.action);
  return (
    <ActionButton
      variant="outline"
      layout="stack"
      label={spec.label || def?.label || "Action"}
      icon={<Icon />}
      disabled={!available}
      {...(available ? {} : { disabledReason: "not available on this screen" })}
      {...(spec.color ? { style: { backgroundColor: spec.color, color: "var(--primary-foreground)", borderColor: "transparent" } } : {})}
      onClick={() => run(spec.action)}
    />
  );
}
