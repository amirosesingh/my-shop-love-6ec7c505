import { posFetch } from "./server-origin";
import { getPosCallerAuth } from "./pos-caller-auth";

/** Same authenticated hosted endpoint for web, Android and Windows. */
export async function requestIdleTimeout(storeId: string, minutes?: number, scope: "branch" | "global" = "branch"): Promise<{ minutes?: number }> {
  const response = await posFetch("/api/public/idle-timeout", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(await getPosCallerAuth()), storeId, scope, ...(minutes === undefined ? {} : { minutes }) }),
  });
  const body = await response.json();
  if (!response.ok || !body?.ok) throw new Error(body?.error ?? "Could not load or save the idle limit");
  return body;
}
