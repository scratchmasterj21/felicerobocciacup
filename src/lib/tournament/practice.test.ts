import { describe, expect, it } from "vitest";
import {
  nextPracticeOrder,
  practiceMatchesToQualifying,
  selectPracticePairings,
} from "./practice";
import { rankStandings } from "./standings";
import { qualifyingOutcomeFromTotals, regulationTotals } from "./roundRobin";
import type { PracticeMatchData, RegulationScores } from "./types";

function completed(
  id: string,
  teamAId: string,
  teamBId: string,
  order: number,
  reg: RegulationScores
): PracticeMatchData {
  const { totalA, totalB } = regulationTotals(reg);
  return {
    id,
    gradeId: "G1",
    divisionId: "A",
    order,
    teamAId,
    teamBId,
    status: "COMPLETED",
    regulation: reg,
    outcome: qualifyingOutcomeFromTotals(totalA, totalB),
  };
}

describe("selectPracticePairings", () => {
  it("caps the number of matches below a full round-robin", () => {
    const teams = ["a", "b", "c", "d", "e", "f", "g"]; // 7 teams = 21 full
    const pairings = selectPracticePairings(teams, 7);
    expect(pairings).toHaveLength(7);
  });

  it("produces no duplicate pairings within the selection", () => {
    const teams = ["a", "b", "c", "d", "e"];
    const pairings = selectPracticePairings(teams, 8);
    const keys = pairings.map((p) => [p.teamA, p.teamB].sort().join("-"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stops at the max unique pairings when count exceeds them", () => {
    const teams = ["a", "b", "c"]; // 3 unique pairings
    expect(selectPracticePairings(teams, 99)).toHaveLength(3);
  });

  it("gives every team play within the first round of a partial count", () => {
    const teams = ["a", "b", "c", "d"]; // partial count = 2 covers all 4
    const pairings = selectPracticePairings(teams, 2);
    const seen = new Set(pairings.flatMap((p) => [p.teamA, p.teamB]));
    expect(seen.size).toBe(4);
  });

  it("returns nothing for invalid input", () => {
    expect(selectPracticePairings(["a"], 3)).toEqual([]);
    expect(selectPracticePairings(["a", "b"], 0)).toEqual([]);
  });
});

describe("nextPracticeOrder", () => {
  it("starts at 1 when empty", () => {
    expect(nextPracticeOrder({})).toBe(1);
    expect(nextPracticeOrder([])).toBe(1);
  });

  it("continues past the current maximum order", () => {
    const matches: PracticeMatchData[] = [
      { id: "1", gradeId: "G1", divisionId: "A", order: 3, teamAId: "a", teamBId: "b", status: "SCHEDULED" },
      { id: "2", gradeId: "G1", divisionId: "A", order: 7, teamAId: "a", teamBId: "c", status: "SCHEDULED" },
    ];
    expect(nextPracticeOrder(matches)).toBe(8);
  });
});

describe("practice ranking", () => {
  const reg = (a: number, b: number): RegulationScores => ({
    round1: { scoreA: a, scoreB: b },
    round2: { scoreA: 0, scoreB: 0 },
  });

  it("maps practice matches and ranks them win=3/draw=1/loss=0", () => {
    const matches: PracticeMatchData[] = [
      completed("m1", "a", "b", 1, reg(3, 1)), // a beats b
      completed("m2", "a", "c", 2, reg(2, 2)), // a draws c
      completed("m3", "b", "c", 3, reg(0, 1)), // c beats b
    ];
    const standings = rankStandings(
      ["a", "b", "c"],
      practiceMatchesToQualifying(matches)
    );
    const byTeam = Object.fromEntries(standings.map((s) => [s.teamId, s]));
    expect(byTeam.a.leaguePoints).toBe(4); // win + draw
    expect(byTeam.c.leaguePoints).toBe(4); // win + draw
    expect(byTeam.b.leaguePoints).toBe(0); // two losses
    expect(byTeam.b.rank).toBe(3);
  });

  it("ignores unscored matches", () => {
    const matches: PracticeMatchData[] = [
      { id: "x", gradeId: "G1", divisionId: "A", order: 1, teamAId: "a", teamBId: "b", status: "SCHEDULED" },
    ];
    const standings = rankStandings(
      ["a", "b"],
      practiceMatchesToQualifying(matches)
    );
    expect(standings.every((s) => s.played === 0)).toBe(true);
  });
});
