import { describe, expect, it } from "vitest";
import { buildResurrectionBracketMatchTree } from "./bracketMatches";
import {
  belowCutTeamIdsForDivision,
  belowCutTeamIdsForUnified,
  resurrectionRegulationFromSinglePeriod,
} from "./resurrection";
import type { QualifyingMatchData } from "./types";

function qm(
  p: Partial<QualifyingMatchData> &
    Pick<QualifyingMatchData, "id" | "teamAId" | "teamBId">
): QualifyingMatchData {
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

describe("belowCutTeamIdsForUnified", () => {
  it("returns teams ranked below K (4 teams → K=2 → bottom two by standings)", () => {
    const teams = ["a", "b", "c", "d"];
    const matches: QualifyingMatchData[] = [
      qm({ id: "1", teamAId: "a", teamBId: "b", outcome: "WIN_A" }),
      qm({ id: "2", teamAId: "a", teamBId: "c", outcome: "WIN_A" }),
      qm({ id: "3", teamAId: "a", teamBId: "d", outcome: "WIN_A" }),
      qm({ id: "4", teamAId: "b", teamBId: "c", outcome: "WIN_A" }),
      qm({ id: "5", teamAId: "b", teamBId: "d", outcome: "WIN_A" }),
      qm({ id: "6", teamAId: "c", teamBId: "d", outcome: "WIN_A" }),
    ];
    const below = belowCutTeamIdsForUnified("G1", teams, matches);
    expect(below).toEqual(["c", "d"]);
  });
});

describe("belowCutTeamIdsForDivision", () => {
  it("1-league mode slices after K by rank order", () => {
    const teams = ["a", "b", "c", "d"];
    const matches: QualifyingMatchData[] = [
      qm({ id: "1", teamAId: "a", teamBId: "b", outcome: "WIN_A" }),
      qm({ id: "2", teamAId: "a", teamBId: "c", outcome: "WIN_A" }),
      qm({ id: "3", teamAId: "a", teamBId: "d", outcome: "WIN_A" }),
      qm({ id: "4", teamAId: "b", teamBId: "c", outcome: "WIN_A" }),
      qm({ id: "5", teamAId: "b", teamBId: "d", outcome: "WIN_A" }),
      qm({ id: "6", teamAId: "c", teamBId: "d", outcome: "WIN_A" }),
    ];
    const below = belowCutTeamIdsForDivision(
      "G1",
      "A",
      teams,
      matches,
      1
    );
    expect(below).toEqual(["c", "d"]);
  });
});

describe("buildResurrectionBracketMatchTree", () => {
  it("builds one scheduled match for two entrants", () => {
    const tree = buildResurrectionBracketMatchTree("G1", "A", ["x", "y"]);
    const r0 = tree.filter((m) => m.roundIndex === 0);
    expect(r0).toHaveLength(1);
    expect(r0[0].teamAId).toBe("x");
    expect(r0[0].teamBId).toBe("y");
    expect(r0[0].matchKind).toBe("resurrection");
    expect(r0[0].id).toBe("G1_RES_A_R0_M0");
  });

  it("pads odd counts and marks bye winners completed", () => {
    const tree = buildResurrectionBracketMatchTree("G2", "U", ["a", "b", "c"]);
    const completed = tree.filter((m) => m.status === "COMPLETED");
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(tree.every((m) => m.matchKind === "resurrection")).toBe(true);
  });
});

describe("resurrectionRegulationFromSinglePeriod", () => {
  it("zeros round2 for storage compatibility", () => {
    const r = resurrectionRegulationFromSinglePeriod(2, 1);
    expect(r.round1).toEqual({ scoreA: 2, scoreB: 1 });
    expect(r.round2).toEqual({ scoreA: 0, scoreB: 0 });
  });
});
