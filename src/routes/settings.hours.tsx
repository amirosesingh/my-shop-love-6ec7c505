import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePos } from "@/lib/pos-store";

export const Route = createFileRoute("/settings/hours")({
  head: () => ({
    meta: [
      { title: "Trading Hours & Shifts — Northwind POS" },
      {
        name: "description",
        content:
          "Set the trading day window, the maximum shift length and when the till reminds cashiers to close their shift.",
      },
      { property: "og:title", content: "Trading Hours & Shifts — Northwind POS" },
      {
        property: "og:description",
        content: "Trading day start and end, shift ceiling and close-the-shift reminders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HoursSettingsPage,
});

function HoursSettingsPage() {
  return (
    <SettingsFrame
      title="Trading hours & shifts"
      description="Every shift is stored centrally, so all terminals agree on what is open."
    >
      <HoursForm />
    </SettingsFrame>
  );
}

function HoursForm() {
  const { state, updateSettings } = usePos();
  const hours = state.settings.hours;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Day begins</Label>
          <Input
            type="time"
            className="numeric"
            value={hours.dayStart}
            onChange={(e) => updateSettings({ hours: { ...hours, dayStart: e.target.value } })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Day ends</Label>
          <Input
            type="time"
            className="numeric"
            value={hours.dayEnd}
            onChange={(e) => updateSettings({ hours: { ...hours, dayEnd: e.target.value } })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Max shift length (hours)</Label>
          <Input
            className="numeric"
            value={hours.maxShiftHours}
            onChange={(e) =>
              updateSettings({ hours: { ...hours, maxShiftHours: Number(e.target.value) || 0 } })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Reminder (minutes before)</Label>
          <Input
            className="numeric"
            value={hours.reminderMinutes}
            onChange={(e) =>
              updateSettings({ hours: { ...hours, reminderMinutes: Number(e.target.value) || 0 } })
            }
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A shift that is still open past the day end, or past the maximum shift length, is flagged as
        overdue in Shifts and in the activity log. Leave both times blank-equal to trade around the
        clock and rely on the shift ceiling alone.
      </p>
    </div>
  );
}
