import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({ tokenId: z.string().min(8).max(100) });

/**
 * Hand an activated terminal its own machine account so its writes are
 * accepted by the central database under the normal row rules.
 */
export const getTerminalAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<
    { ok: true; email: string; password: string } | { ok: false; error: string }
  > => {
    try {
      const { ensureTerminalAccount } = await import("./terminal-account.server");
      const account = await ensureTerminalAccount(data.tokenId);
      return { ok: true, ...account };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });