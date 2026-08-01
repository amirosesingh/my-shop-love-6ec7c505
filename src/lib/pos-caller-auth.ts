import { supabaseExternal } from "@/integrations/supabase/external-client";

export const TERMINAL_TOKEN_KEY = "pos-terminal-token-v1";

export function readTerminalToken(): string | null {
  try {
    return window.sessionStorage.getItem(TERMINAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Credentials to send with privileged server functions. */
export async function getPosCallerAuth(): Promise<{
  accessToken?: string;
  terminalToken?: string;
}> {
  const accessToken =
    (await supabaseExternal.auth.getSession()).data.session?.access_token ?? undefined;
  const terminalToken = readTerminalToken() ?? undefined;
  return { ...(accessToken ? { accessToken } : {}), ...(terminalToken ? { terminalToken } : {}) };
}