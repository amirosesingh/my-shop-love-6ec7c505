import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({
  tokenId: z.string().min(8).max(100),
  deviceProof: z.string().min(16).max(200),
  device: z
    .object({
      platform: z.enum(["web", "mobile", "electron"]).default("web"),
      os: z.string().max(120).default(""),
    })
    .default({ platform: "web", os: "" }),
});

/**
 * Hand an activated terminal its own machine account so its writes are
 * accepted by the central database under the normal row rules.
 *
 * The token id alone is not enough: the caller must present the one-time
 * device proof minted when this machine won the claim.
 */
export const claimTerminalToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<
    { ok: true; email: string; password: string } | { ok: false; error: string }
  > => {
    try {
      const { issueTerminalAccount } = await import("./terminal-account.server");
      const account = await issueTerminalAccount(data.tokenId, data.deviceProof, data.device);
      return { ok: true, ...account };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
