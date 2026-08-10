import { beforeEach, describe, expect, it } from "vitest";
import {
  effectiveDatabaseMode,
  noteConnectionLost,
  noteConnectionRestored,
  preferredDatabaseMode,
  setPreferredDatabaseMode,
} from "../db-mode";

describe("database mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    noteConnectionRestored();
  });

  it("defaults to local-first on a till", () => {
    expect(preferredDatabaseMode()).toBe("local");
  });

  it("writes online when online mode is chosen and the connection is up", () => {
    setPreferredDatabaseMode("online");
    expect(effectiveDatabaseMode()).toBe("online");
  });

  it("fails over to local without changing the chosen mode", () => {
    setPreferredDatabaseMode("online");
    noteConnectionLost();
    expect(effectiveDatabaseMode()).toBe("local");
    expect(preferredDatabaseMode()).toBe("online");
    noteConnectionRestored();
    expect(effectiveDatabaseMode()).toBe("online");
  });
});