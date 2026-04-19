import { describe, expect, it } from "vitest";
import {
  computeSeedsForGrade,
  computeSeedsForGradeDivision,
  computeSeedsForGradeUnified,
} from "./gradeSeeds";
import type { QualifyingMatchData } from "./types";

describe("computeSeedsForGrade", () => {
  it("produces 6 finalists for G1 5+5 when standings permit", () => {
    const teamsA = ["a1", "a2", "a3", "a4", "a5"];
    const teamsB = ["b1", "b2", "b3", "b4", "b5"];
    const matches: QualifyingMatchData[] = [];
    const { seeds, kA, kB } = computeSeedsForGrade(
      "G1",
      { A: teamsA, B: teamsB },
      matches
    );
    expect(kA).toBe(3);
    expect(kB).toBe(3);
    expect(seeds.length).toBe(6);
  });
});

describe("computeSeedsForGradeUnified", () => {
  it("takes top K by rank from a single pool (5 teams -> K=3)", () => {
    const teams = ["t1", "t2", "t3", "t4", "t5"];
    const matches: QualifyingMatchData[] = [];
    const { k, seeds } = computeSeedsForGradeUnified("G1", teams, matches);
    expect(k).toBe(3);
    expect(seeds.length).toBe(3);
  });
});

describe("computeSeedsForGradeDivision", () => {
  it("supports split leagues and returns top K across merged ordering", () => {
    const teams = ["t1", "t2", "t3", "t4", "t5"];
    const matches: QualifyingMatchData[] = [];
    const leagueAssignment: Record<string, "L1" | "L2"> = {
      t1: "L1",
      t2: "L2",
      t3: "L1",
      t4: "L2",
      t5: "L1",
    };
    const { k, seeds } = computeSeedsForGradeDivision(
      "G1",
      "A",
      teams,
      matches,
      2,
      leagueAssignment
    );
    expect(k).toBe(3);
    expect(seeds.length).toBe(3);
    expect(seeds).toEqual(["t1", "t2", "t3"]);
  });
});
