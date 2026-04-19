import { describe, expect, it } from "vitest";
import {
  divisionLeagueKey,
  effectiveLeagueCount,
  partitionTeamsIntoLeagues,
  partitionTeamsIntoLeaguesFromSaved,
} from "./leagueSplit";

describe("leagueSplit", () => {
  it("builds stable grade-division key", () => {
    expect(divisionLeagueKey("G1", "A")).toBe("G1_A");
  });

  it("falls back to one league when teams are too few", () => {
    expect(effectiveLeagueCount(2, 3)).toBe(1);
    expect(effectiveLeagueCount(2, 4)).toBe(2);
  });

  it("partitions teams deterministically and balances sizes", () => {
    const out = partitionTeamsIntoLeagues(["t4", "t1", "t3", "t2", "t5"]);
    expect(out.L1).toEqual(["t1", "t3", "t5"]);
    expect(out.L2).toEqual(["t2", "t4"]);
  });

  it("partitionTeamsIntoLeaguesFromSaved uses full saved map", () => {
    const saved = {
      a: "L1" as const,
      b: "L2" as const,
      c: "L1" as const,
      d: "L2" as const,
    };
    const out = partitionTeamsIntoLeaguesFromSaved(["d", "a", "c", "b"], saved);
    expect(out.L1.sort()).toEqual(["a", "c"]);
    expect(out.L2.sort()).toEqual(["b", "d"]);
  });

  it("partitionTeamsIntoLeaguesFromSaved balances unassigned new teams", () => {
    const saved = { a: "L1" as const, b: "L2" as const };
    const out = partitionTeamsIntoLeaguesFromSaved(["a", "b", "z", "y"], saved);
    expect(out.L1).toContain("a");
    expect(out.L2).toContain("b");
    expect(out.L1.length + out.L2.length).toBe(4);
    expect(new Set([...out.L1, ...out.L2]).size).toBe(4);
  });

  it("partitionTeamsIntoLeaguesFromSaved empty saved matches legacy partition", () => {
    const ids = ["t4", "t1", "t3", "t2", "t5"];
    expect(partitionTeamsIntoLeaguesFromSaved(ids, undefined)).toEqual(
      partitionTeamsIntoLeagues(ids)
    );
    expect(partitionTeamsIntoLeaguesFromSaved(ids, {})).toEqual(
      partitionTeamsIntoLeagues(ids)
    );
  });
});
