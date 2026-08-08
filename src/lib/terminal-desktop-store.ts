/**
 * Windows shell mirror for the terminal's machine credentials.
 *
 * The desktop app stores them in its user-data folder, protected by the
 * operating system's own secret store when available, so an in-place update or
 * a cleared renderer storage never forces the branch to pair the till again.
 * On web and Android this is a no-op.
 */
type Account = { email: string; password: string };

type Bridge = {
  readTerminalSecrets: () => Promise<{ ok: boolean; secrets?: Account | null }>;
  writeTerminalSecrets: (secrets: Account | null) => Promise<{ ok: boolean }>;
  lockTerminal?: () => Promise<{ ok: boolean }>;
};

const bridge = (): Bridge | null => {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { pos?: Partial<Bridge> }).pos;
  return api && typeof api.writeTerminalSecrets === "function" ? (api as Bridge) : null;
};

export async function readDesktopCredentials(): Promise<Account | null> {
  try {
    const result = await bridge()?.readTerminalSecrets();
    return result?.secrets?.email ? result.secrets : null;
  } catch {
    return null;
  }
}

export async function writeDesktopCredentials(secrets: Account | null): Promise<void> {
  try {
    await bridge()?.writeTerminalSecrets(secrets);
  } catch {
    /* non-fatal */
  }
}

/** Tell the desktop shell to lock its window after a revocation. */
export async function lockDesktopWindow(): Promise<void> {
  try {
    await bridge()?.lockTerminal?.();
  } catch {
    /* non-fatal */
  }
}
