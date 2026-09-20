import { Progress } from "@/components/ui/progress";

export type DatabaseJob = {
  status?: string;
  phase?: string;
  current_table?: string | null;
  currentTable?: string | null;
  completed_rows?: number;
  completedRows?: number;
  estimated_total_rows?: number;
  estimatedTotalRows?: number;
  batch_number?: number;
  batchNumber?: number;
  error_message?: string | null;
  errorMessage?: string | null;
};

const title = (value?: string | null) =>
  value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Preparing";

export function DatabaseJobProgress({ job }: { job?: DatabaseJob | null }) {
  if (!job) return <p className="text-sm text-muted-foreground">No database job is active.</p>;
  const completed = Number(job.completed_rows ?? job.completedRows ?? 0);
  const total = Number(job.estimated_total_rows ?? job.estimatedTotalRows ?? 0);
  const percent = total > 0 ? Math.min(100, (100 * completed) / total) : 0;
  const error = job.error_message ?? job.errorMessage;
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>{title(job.phase)} · {title(job.current_table ?? job.currentTable)}</span>
        <span>{total > 0 ? `${completed.toLocaleString()} / ${total.toLocaleString()} rows` : title(job.status)}</span>
      </div>
      <Progress value={percent} aria-label="Database job progress" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Batch {Number(job.batch_number ?? job.batchNumber ?? 0).toLocaleString()}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
