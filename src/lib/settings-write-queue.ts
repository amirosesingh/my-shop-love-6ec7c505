/** Serialize edits per scope and retain failed writes for an explicit retry. */
export class SettingsWriteQueue {
  private entries = new Map<string, { save: () => Promise<unknown>; result: Promise<{ error?: unknown }> }>();
  revision = 0;
  get pending() { return this.entries.size > 0; }
  enqueue(key: string, save: () => Promise<unknown>) {
    this.revision++;
    const previous = this.entries.get(key)?.result ?? Promise.resolve({});
    const result = previous.then(save).then(() => ({}), (error: unknown) => ({ error }));
    const entry = { save, result };
    this.entries.set(key, entry);
    void result.then((outcome) => {
      if (!("error" in outcome) && this.entries.get(key) === entry) this.entries.delete(key);
    });
  }
  async flush() {
    for (const [key, entry] of this.entries) {
      const outcome = await entry.result;
      if ("error" in outcome) await entry.save();
      if (this.entries.get(key) === entry) this.entries.delete(key);
    }
  }
}
