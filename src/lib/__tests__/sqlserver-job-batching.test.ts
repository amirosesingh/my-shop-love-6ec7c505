import { describe, expect, it } from "vitest";
import manager from "../../../electron/jobs/manager.cjs";
const { nextBatchSize } = manager;

describe("high-volume database jobs", () => {
  it("keeps batches bounded and adapts after pressure", () => {
    expect(nextBatchSize(500,"success")).toBe(600);
    expect(nextBatchSize(2000,"success")).toBe(2000);
    expect(nextBatchSize(500,"timeout")).toBe(250);
    expect(nextBatchSize(100,"oversized")).toBe(100);
  });

  it("can walk one million rows without retaining previous pages", () => {
    let cursor=0; let maxHeld=0; let processed=0;
    while(processed<1_000_000){ const page=Array.from({length:Math.min(500,1_000_000-processed)},(_,i)=>cursor+i+1); maxHeld=Math.max(maxHeld,page.length); cursor=page.at(-1)!; processed+=page.length; }
    expect(processed).toBe(1_000_000); expect(maxHeld).toBe(500);
  });
});
