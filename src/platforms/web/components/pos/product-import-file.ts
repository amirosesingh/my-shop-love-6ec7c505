export type ImportFileProgress = { percent: number; label: string };

type WorkerMessage =
  | { type: "progress"; percent: number; label: string }
  | { type: "rows"; rows: Record<string, unknown>[] }
  | { type: "complete"; total: number }
  | { type: "error"; message: string };

/** Parse spreadsheets away from React's thread and transfer results in bounded chunks. */
export async function parseProductImportFile(
  file: File,
  onProgress?: (progress: ImportFileProgress) => void,
): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./product-import.worker.ts", import.meta.url), {
      type: "module",
      name: "product-import-parser",
    });
    const rows: Record<string, unknown>[] = [];
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") onProgress?.(message);
      if (message.type === "rows") rows.push(...message.rows);
      if (message.type === "complete") {
        worker.terminate();
        resolve(rows);
      }
      if (message.type === "error") {
        worker.terminate();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Spreadsheet worker failed"));
    };
    worker.postMessage({ name: file.name, buffer }, [buffer]);
  });
}
