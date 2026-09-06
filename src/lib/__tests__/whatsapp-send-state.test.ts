/**
 * The register must never be left showing "sending".
 *
 * The automatic bill send is fire-and-forget, so a throw inside it used to
 * strand the flag on and surface as an unhandled rejection.
 */
import { describe, expect, it, vi } from "vitest";

const success = vi.fn();
const error = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) } }));

import { runWhatsAppSend } from "@/lib/register/wa-send";

const flags = () => {
  const seen: boolean[] = [];
  return { seen, set: (v: boolean) => void seen.push(v) };
};

describe("WhatsApp send state", () => {
  it("clears the sending flag and reports the failure when the send throws", async () => {
    success.mockReset();
    error.mockReset();
    const f = flags();
    await runWhatsAppSend(f.set, async () => {
      throw new Error("Failed to fetch");
    }, "Bill sent");
    expect(f.seen).toEqual([true, false]);
    expect(error).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("never rejects, so the fire-and-forget caller cannot leak a rejection", async () => {
    const f = flags();
    await expect(
      runWhatsAppSend(f.set, () => Promise.reject(new Error("token expired")), "Bill sent"),
    ).resolves.toBeUndefined();
    expect(f.seen.at(-1)).toBe(false);
  });

  it("reports a refused send and still clears the flag", async () => {
    error.mockReset();
    const f = flags();
    await runWhatsAppSend(f.set, async () => ({ ok: false, error: "Bad number" }), "Bill sent");
    expect(f.seen).toEqual([true, false]);
    expect(error).toHaveBeenCalledWith("WhatsApp send failed", { description: "Bad number" });
  });

  it("confirms a successful send and clears the flag", async () => {
    success.mockReset();
    const f = flags();
    await runWhatsAppSend(f.set, async () => ({ ok: true }), "Bill B1 sent on WhatsApp");
    expect(f.seen).toEqual([true, false]);
    expect(success).toHaveBeenCalledWith("Bill B1 sent on WhatsApp");
  });
});
