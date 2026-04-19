import { describe, expect, it } from "vitest";
import {
  generateCompleteBipartitePairings,
  generateRoundRobinPairings,
  getQualifyingFixturePairings,
  qualifyingOutcomeFromTotals,
  tryTwoSchoolBipartitePartition,
} from "./roundRobin";

describe("generateRoundRobinPairings", () => {
  it("returns n*(n-1)/2 matches for even n", () => {
    const teams = ["a", "b", "c", "d"];
    const p = generateRoundRobinPairings(teams);
    expect(p.length).toBe((4 * 3) / 2);
  });

  it("returns n*(n-1)/2 matches for odd n (bye rounds)", () => {
    const teams = ["a", "b", "c", "d", "e"];
    const p = generateRoundRobinPairings(teams);
    expect(p.length).toBe((5 * 4) / 2);
  });

  it("never pairs a team with itself", () => {
    const teams = ["a", "b", "c", "d", "e", "f"];
    for (const x of generateRoundRobinPairings(teams)) {
      expect(x.teamA).not.toBe(x.teamB);
    }
  });
});

describe("tryTwoSchoolBipartitePartition / bipartite fixtures", () => {
  it("returns null if any team lacks a school", () => {
    expect(
      tryTwoSchoolBipartitePartition(["a", "b"], { a: "s1" })
    ).toBeNull();
  });

  it("returns two groups when exactly two schools", () => {
    expect(
      tryTwoSchoolBipartitePartition(
        ["a", "b", "c"],
        { a: "s1", b: "s1", c: "s2" }
      )
    ).toEqual({ left: ["a", "b"], right: ["c"] });
  });

  it("returns null when more than two schools", () => {
    expect(
      tryTwoSchoolBipartitePartition(
        ["a", "b", "c"],
        { a: "s1", b: "s2", c: "s3" }
      )
    ).toBeNull();
  });

  it("K2,2 has four cross-school matches", () => {
    const p = generateCompleteBipartitePairings(["a1", "a2"], ["b1", "b2"]);
    expect(p.length).toBe(4);
    for (const m of p) {
      expect(m.teamA.startsWith("a")).toBe(true);
      expect(m.teamB.startsWith("b")).toBe(true);
    }
  });

  it("getQualifyingFixturePairings uses bipartite when two schools fully assigned", () => {
    const p = getQualifyingFixturePairings(["a1", "a2", "b1"], {
      a1: "S1",
      a2: "S1",
      b1: "S2",
    });
    expect(p.length).toBe(2);
  });
});

describe("qualifyingOutcomeFromTotals", () => {
  it("returns DRAW on equal totals", () => {
    expect(qualifyingOutcomeFromTotals(3, 3)).toBe("DRAW");
  });
});
