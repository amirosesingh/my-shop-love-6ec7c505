/**
 * Offline WhatsApp outbox.
 *
 * Sending a bill needs the cloud, so when the branch is offline the message is
 * parked here and flushed automatically once the connection returns.
 */
export type QueuedMessage = {
  id: string;
  phoneNumberId: string;
  to: string;
  body: string;
  reference: string;
  queuedAt: string;
};

const KEY = "pos.whatsapp.queue.v1";
const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();

function read(): QueuedMessage[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as QueuedMessage[];
  } catch {
    return [];
  }
}

function write(rows: QueuedMessage[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* storage full */
  }
  for (const l of listeners) l();
}

export const subscribeWhatsAppQueue = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const listQueuedMessages = () => read();
export const queuedMessageCount = () => read().length;

export function queueMessage(msg: Omit<QueuedMessage, "id" | "queuedAt">) {
  const entry: QueuedMessage = { ...msg, id: crypto.randomUUID(), queuedAt: new Date().toISOString() };
  write([...read(), entry]);
  return entry;
}

export function resolveMessage(id: string) {
  write(read().filter((m) => m.id !== id));
}
