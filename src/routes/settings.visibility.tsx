import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { SettingsSections } from "@/components/pos/settings/SettingsSection";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/pos-auth";
import {
  VISIBILITY_ELEMENTS,
  VISIBILITY_GROUPS,
  VISIBILITY_ROLES,
  useVisibility,
} from "@/lib/ui-visibility";

export const Route = createFileRoute("/settings/visibility")({
  head: () => ({
    meta: [
      { title: "Screen Visibility — Northwind POS" },
      {
        name: "description",
        content:
          "Choose which register and inventory elements each role can see — hide payment buttons, cost columns or bill history from cashiers.",
      },
      { property: "og:title", content: "Screen Visibility — Northwind POS" },
      {
        property: "og:description",
        content: "Hide or show register and inventory elements per staff role.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VisibilitySettingsPage,
});

function VisibilitySettingsPage() {
  const { isAdmin } = useAuth();
  const { hidden, setHidden } = useVisibility();

  return (
    <SettingsFrame
      title="Screen visibility"
      description="Hide parts of the register and inventory from chosen roles. Administrators always see everything."
    >
      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">
          Only an administrator can change what other roles see.
        </p>
      ) : (
        <div className="space-y-6">
          <SettingsSections
            storageKey="visibility"
            items={VISIBILITY_GROUPS.map((group) => ({
              id: group,
              title: group,
              blurb: `${VISIBILITY_ELEMENTS.filter((e) => e.group === group).length} elements`,
              content: (
                <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Element</th>
                      {VISIBILITY_ROLES.map((r) => (
                        <th key={r.id} className="px-3 py-2 text-center font-medium">
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {VISIBILITY_ELEMENTS.filter((e) => e.group === group).map((el) => (
                      <tr key={el.key} className="border-t border-border">
                        <td className="px-3 py-2">
                          <span className="block font-medium">{el.label}</span>
                          <span className="block text-xs text-muted-foreground">{el.blurb}</span>
                        </td>
                        {VISIBILITY_ROLES.map((r) => {
                          const isHidden = (hidden[el.key] ?? []).includes(r.id);
                          return (
                            <td key={r.id} className="px-3 py-2 text-center">
                              <Switch
                                checked={!isHidden}
                                aria-label={`${el.label} visible to ${r.label}`}
                                onCheckedChange={(on) => setHidden(el.key, r.id, !on)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ),
            }))}
          />
          <p className="text-[11px] text-muted-foreground">
            A switch that is on means the role can see that element. Hiding an element only
            removes it from the screen — the permission matrix still controls what may be done.
          </p>
        </div>
      )}
    </SettingsFrame>
  );
}
