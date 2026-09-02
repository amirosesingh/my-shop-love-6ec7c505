import type { Shift, TradingHours } from "@/core/types/pos-types";

const TERMINAL_KEY = "pos.terminal.localId";

/** Stable per-PC id used when the terminal has not been activated yet. */
export function localTerminalId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(TERMINAL_KEY);
  if (!id) {
    id = `pc-${crypto.randomUUID().slice(0, 8)}`;
    window.localStorage.setItem(TERMINAL_KEY, id);
  }
  return id;
}

const minutesOfDay = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Timestamp at which a shift should have been closed, or null when open-ended. */
export function shiftDeadline(shift: Shift, hours: TradingHours): Date | null {
  const opened = new Date(shift.openedAt);
  const candidates: number[] = [];

  if (hours.maxShiftHours > 0) {
    candidates.push(opened.getTime() + hours.maxShiftHours * 3600_000);
  }

  const end = minutesOfDay(hours.dayEnd ?? "");
  const start = minutesOfDay(hours.dayStart ?? "");
  if (end != null) {
    const close = new Date(opened);
    close.setHours(0, 0, 0, 0);
    close.setMinutes(end);
    // Overnight trading (e.g. 18:00 -> 02:00) rolls the close into the next day.
    if (start != null && end <= start) close.setDate(close.getDate() + 1);
    if (close.getTime() <= opened.getTime()) close.setDate(close.getDate() + 1);
    candidates.push(close.getTime());
  }

  if (!candidates.length) return null;
  return new Date(Math.min(...candidates));
}

/** True when an open shift has run past the trading window or shift ceiling. */
export function isShiftOverdue(shift: Shift, hours: TradingHours, now = new Date()): boolean {
  const deadline = shiftDeadline(shift, hours);
  if (!deadline) return false;
  const ref = shift.closedAt ? new Date(shift.closedAt) : now;
  return ref.getTime() > deadline.getTime();
}

/** Minutes until the shift is due to close — negative once it is overdue. */
export function minutesUntilDue(
  shift: Shift,
  hours: TradingHours,
  now = new Date(),
): number | null {
  const deadline = shiftDeadline(shift, hours);
  if (!deadline) return null;
  return Math.round((deadline.getTime() - now.getTime()) / 60_000);
}

/** Should the "close the shift" reminder be showing right now? */
export function shouldRemind(shift: Shift, hours: TradingHours, now = new Date()): boolean {
  const left = minutesUntilDue(shift, hours, now);
  if (left == null) return false;
  return left <= Math.max(0, hours.reminderMinutes);
}

/** Human duration such as "9h 12m" for shift lists. */
export function shiftDuration(shift: Shift, now = new Date()): string {
  const end = shift.closedAt ? new Date(shift.closedAt) : now;
  const mins = Math.max(0, Math.round((end.getTime() - new Date(shift.openedAt).getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}
