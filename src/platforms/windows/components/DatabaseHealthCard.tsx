import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export function DatabaseHealthCard({ state }: { state: { connected?: boolean; state?: string; profile?: { database?: string } | null } }) {
  return <Card><CardHeader><CardTitle className="text-base">Database health</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm sm:grid-cols-3"><span>Status: {state.state ?? "Unknown"}</span><span>Database: {state.profile?.database ?? "Not selected"}</span><span>Connection: {state.connected ? "Ready" : "Not ready"}</span></CardContent></Card>;
}
