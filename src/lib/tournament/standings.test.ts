import { describe, expect, it } from "vitest";
import { rankStandings } from "./standings";
import type { QualifyingMatchData } from "./types";

function qm(p: Partial<QualifyingMatchData> & Pick<QualifyingMatchData, "id" | "teamAId" | "teamBId">): QualifyingMatchData {
  return {
    gradeId: "G1",
    divisionId: "A",
    round: 1,
    status: "COMPLETED",
    outcome: "WIN_A",
    regulation: {
      round1: { scoreA: 1, scoreB: 0 },
      round2: { scoreA: 0, scoreB: 0 },
    },
    ...p,
  };
}

describe("rankStandings", () => {
  it("ranks by points", () => {
    const teams = ["a", "b", "c"];
    const matches: QualifyingMatchData[] = [
      qm({ id: "1", teamAId: "a", teamBId: "b", outcome: "WIN_A" }),
      qm({ id: "2", teamAId: "a", teamBId: "c", outcome: "WIN_A" }),
      qm({ id: "3", teamAId: "b", teamBId: "c", outcome: "WIN_B" }),
    ];
    const r = rankStandings(teams, matches);
    expect(r[0].teamId).toBe("a");
    expect(r[0].leaguePoints).toBe(6);
  });

  it("ranks by totalScore when fair play is enabled", () => {
    const teams = ["a", "b"];
    const matches: QualifyingMatchData[] = [
      qm({
        id: "1",
        teamAId: "a",
        teamBId: "b",
        outcome: "DRAW",
        regulation: {
          round1: { scoreA: 1, scoreB: 1 },
          round2: { scoreA: 0, scoreB: 0 },
        },
      }),
    ];
    const fairPlay = new Map([
      ["a", 15],
      ["b", 14],
    ]);
    const r = rankStandings(teams, matches, { fairPlayByTeamId: fairPlay });
    expect(r[0].teamId).toBe("a");
    expect(r[0].leaguePoints).toBe(1);
    expect(r[0].fairPlayPoints).toBe(15);
    expect(r[0].totalScore).toBe(16);
    expect(r[1].teamId).toBe("b");
    expect(r[1].totalScore).toBe(15);
  });
});
