import { describe, expect, it } from "vitest";
import { getBracketMatchDisplay } from "./bracketMatchDisplay";
import type { FinalMatchData } from "./types";

function baseMatch(): FinalMatchData {
  return {
    id: "G1_R0_M0",
    gradeId: "G1",
    roundIndex: 0,
    slotInRound: 0,
    teamAId: "a",
    teamBId: "b",
    status: "SCHEDULED",
  };
}

describe("getBracketMatchDisplay", () => {
  it("returns scheduled for untouched matches", () => {
    const d = getBracketMatchDisplay(baseMatch());
    expect(d.phaseLabel).toBe("Scheduled");
    expect(d.accent).toBe("scheduled");
    expect(d.subline).toBeUndefined();
  });

  it("shows final with regulation score on decisive completion", () => {
    const d = getBracketMatchDisplay({
      ...baseMatch(),
      status: "COMPLETED",
      winnerTeamId: "a",
      regulation: {
        round1: { scoreA: 2, scoreB: 1 },
        round2: { scoreA: 0, scoreB: 0 },
      },
    });
    expect(d.phaseLabel).toBe("Final");
    expect(d.scoreSummary).toBe("2-1");
    expect(d.accent).toBe("completed");
  });

  it("shows regulation tie in progress", () => {
    const d = getBracketMatchDisplay({
      ...baseMatch(),
      status: "IN_PROGRESS",
      regulation: {
        round1: { scoreA: 1, scoreB: 1 },
        round2: { scoreA: 0, scoreB: 0 },
      },
    });
    expect(d.phaseLabel).toBe("Reg tied");
    expect(d.subline).toBe("Reg tied · 1-1");
    expect(d.accent).toBe("regulation");
  });

  it("shows sudden death when extra is tied", () => {
    const d = getBracketMatchDisplay({
      ...baseMatch(),
      status: "IN_PROGRESS",
      regulation: {
        round1: { scoreA: 1, scoreB: 1 },
        round2: { scoreA: 0, scoreB: 0 },
      },
      extra8min: {
        status: "COMPLETED",
        round: { scoreA: 0, scoreB: 0 },
        tiedAfterExtra: true,
      },
      suddenDeath: {
        status: "IN_PROGRESS",
        cycleIndex: 0,
        cycles: {},
      },
    });
    expect(d.phaseLabel).toBe("SD C1");
    expect(d.subline).toContain("Reg 1-1");
    expect(d.accent).toBe("suddenDeath");
  });

  it("shows final-from-SD when completed after sudden death", () => {
    const d = getBracketMatchDisplay({
      ...baseMatch(),
      status: "COMPLETED",
      winnerTeamId: "a",
      regulation: {
        round1: { scoreA: 2, scoreB: 2 },
        round2: { scoreA: 0, scoreB: 0 },
      },
      extra8min: {
        status: "COMPLETED",
        round: { scoreA: 0, scoreB: 0 },
        tiedAfterExtra: true,
      },
      suddenDeath: {
        status: "COMPLETED",
        cycleIndex: 0,
        cycles: { "0": { closer: "A" } },
      },
    });
    expect(d.phaseLabel).toBe("Final (SD x1)");
    expect(d.subline).toContain("2-2");
    expect(d.subline).toContain("Ex 0-0");
    expect(d.accent).toBe("completed");
  });

  it("shows total SD cycles when multiple ties happened before winner", () => {
    const d = getBracketMatchDisplay({
      ...baseMatch(),
      status: "COMPLETED",
      winnerTeamId: "b",
      regulation: {
        round1: { scoreA: 1, scoreB: 1 },
        round2: { scoreA: 0, scoreB: 0 },
      },
      extra8min: {
        status: "COMPLETED",
        round: { scoreA: 0, scoreB: 0 },
        tiedAfterExtra: true,
      },
      suddenDeath: {
        status: "COMPLETED",
        cycleIndex: 3,
        cycles: {
          "0": { closer: "TIE" },
          "1": { closer: "TIE" },
          "2": { closer: "TIE" },
          "3": { closer: "B" },
        },
      },
    });
    expect(d.phaseLabel).toBe("Final (SD x4)");
    expect(d.accent).toBe("completed");
  });
});
