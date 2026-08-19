import { describe, expect, it } from "vitest";
import { createTournamentBackup, parseTournamentBackup } from "./backup";

describe("tournament backups", () => {
  it("round-trips a valid snapshot", () => {
    const backup = createTournamentBackup("cup2026", { meta: { name: "Cup" } });
    expect(parseTournamentBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it("rejects arbitrary JSON", () => {
    expect(() => parseTournamentBackup('{"hello":"world"}')).toThrow(
      "unsupported backup format"
    );
  });

  it("requires tournament metadata", () => {
    const backup = createTournamentBackup("cup2026", { teams: {} });
    expect(() => parseTournamentBackup(JSON.stringify(backup))).toThrow(
      "missing tournament metadata"
    );
  });
});
