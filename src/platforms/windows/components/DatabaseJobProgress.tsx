import { Progress } from "@/components/ui/progress";
export function DatabaseJobProgress({ job }: { job?: { phase?: string; currentTable?: string; completedRows?: number; estimatedTotalRows?: number } | null }) {
  if (!job) return <p className="text-sm text-muted-foreground">No database job is active.</p>;
  const percent = job.estimatedTotalRows ? Math.min(100, (100 * (job.completedRows ?? 0)) / job.estimatedTotalRows) : 0;
  return <div className="space-y-2"><div className="flex justify-between text-sm"><span>{job.phase ?? "Working"} · {job.currentTable ?? "Preparing"}</span><span>{Math.round(percent)}%</span></div><Progress value={percent} /></div>;
}
