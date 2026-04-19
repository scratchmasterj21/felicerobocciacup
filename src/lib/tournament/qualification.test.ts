import { describe, expect, it } from "vitest";
import { qualificationCountForDivision, alternateDivisionSeeds } from "./qualification";
import type { StandingRow } from "./types";

function row(teamId: string, rank: number): StandingRow {
  return {
    teamId,
    rank,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    leaguePoints: 0,
  };
}

describe("qualificationCountForDivision", () => {
  it("matches floor(2n/3) examples", () => {
    expect(qualificationCountForDivision(4)).toBe(2);
    expect(qualificationCountForDivision(5)).toBe(3);
    expect(qualificationCountForDivision(6)).toBe(4);
    expect(qualificationCountForDivision(7)).toBe(4);
  });
});

describe("alternateDivisionSeeds", () => {
  it("interleaves A1 B1 A2 B2", () => {
    const A = [row("a1", 1), row("a2", 2)];
    const B = [row("b1", 1), row("b2", 2)];
    expect(alternateDivisionSeeds(A, B, 2, 2)).toEqual(["a1", "b1", "a2", "b2"]);
  });
});
