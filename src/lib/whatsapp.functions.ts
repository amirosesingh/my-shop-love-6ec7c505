import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const payload = z.object({
  phoneNumberId: z.string().min(5).max(40),
  /** digits only, international format */
  to: z.string().regex(/^\d{6,15}$/),
  body: z.string().min(1).max(3000),
});

/**
 * Sends a plain-text WhatsApp message through the Meta WhatsApp Cloud API.
 * The permanent access token lives server-side in the WHATSAPP_TOKEN secret.
 */
export const sendWhatsAppBill = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => payload.parse(data))
  .handler(async ({ data }) => {
    const token = process.env["WHATSAPP_TOKEN"];
    if (!token) {
      return { ok: false as const, error: "WhatsApp access token is not configured" };
    }
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${data.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: data.to,
          type: "text",
          text: { preview_url: false, body: data.body },
        }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error(`[whatsapp] send failed [${res.status}]: ${text}`);
      return { ok: false as const, error: `WhatsApp API ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true as const, response: text.slice(0, 300) };
  });
