/**
 * Ticket trail — who touched an open ticket and when.
 *
 * Clearing, voiding, holding, reopening and reprinting all write one of the
 * action names below through the normal audit logger, so the entries sync to
 * the cloud with the rest of the activity journal. The Hold Tickets screen
 * reads them back with `useTicketTrail()`.
 */
import { logger, useAuditLogs, type AuditLog } from "./audit-log";

export const TICKET_ACTIONS = {
  cleared: "Ticket cleared",
  voided: "Cart voided",
  held: "Order put on hold",
  resumed: "Held order resumed",
  switched: "Switched to another held ticket",
  discarded: "Held ticket discarded",
  reprinted: "Receipt reprinted",
} as const;

export type TicketAction = (typeof TICKET_ACTIONS)[keyof typeof TICKET_ACTIONS];

const CATEGORY: Record<TicketAction, string> = {
  [TICKET_ACTIONS.cleared]: "refund",
  [TICKET_ACTIONS.voided]: "refund",
  [TICKET_ACTIONS.held]: "sale",
  [TICKET_ACTIONS.resumed]: "sale",
  [TICKET_ACTIONS.switched]: "sale",
  [TICKET_ACTIONS.discarded]: "refund",
  [TICKET_ACTIONS.reprinted]: "print",
};

export function logTicketEvent(action: TicketAction, details: Record<string, unknown> = {}) {
  return logger.log(CATEGORY[action] ?? "sale", action, "register", details);
}

const ACTION_SET = new Set<string>(Object.values(TICKET_ACTIONS));

/** Every ticket-lifecycle entry, newest first. */
export function useTicketTrail(): AuditLog[] {
  const logs = useAuditLogs();
  return logs.filter((l) => ACTION_SET.has(l.action));
}