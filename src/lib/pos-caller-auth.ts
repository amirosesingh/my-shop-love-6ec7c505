/**
 * Credentials to send with privileged server functions.
 *
 * Each token is labelled correctly — a cashier PIN session is a `cashierToken`,
 * never a `terminalToken` — otherwise the server looks it up as an activation
 * token, finds nothing and refuses the call.
 */
import { readCredentials, cashierTokenSync, TERMINAL_TOKEN_KEY } from "./pos-credentials";
import type { PosCredentials } from "./pos-credentials";

export { TERMINAL_TOKEN_KEY };

export function readTerminalToken(): string | null {
  return cashierTokenSync();
}

export async function getPosCallerAuth(): Promise<PosCredentials> {
  return readCredentials();
}
