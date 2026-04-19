import { describe, expect, it } from "vitest";
import {
  applyExtraEightComplete,
  applyRegulationComplete,
  applySuddenDeathCloser,
} from "./finalMatch";
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

describe("final match state machine", () => {
  it("completes on regulation decision", () => {
    const m = applyRegulationComplete(baseMatch(), {
      round1: { scoreA: 2, scoreB: 1 },
      round2: { scoreA: 0, scoreB: 0 },
    });
    expect(m.status).toBe("COMPLETED");
    expect(m.winnerTeamId).toBe("a");
  });

  it("enters extra path on regulation tie", () => {
    const m = applyRegulationComplete(baseMatch(), {
      round1: { scoreA: 1, scoreB: 1 },
      round2: { scoreA: 0, scoreB: 0 },
    });
    expect(m.status).toBe("IN_PROGRESS");
    expect(m.winnerTeamId).toBeUndefined();
  });

  it("enters sudden death on extra tie", () => {
    let m = applyRegulationComplete(baseMatch(), {
      round1: { scoreA: 1, scoreB: 0 },
      round2: { scoreA: 0, scoreB: 1 },
    });
    m = applyExtraEightComplete(m, { scoreA: 0, scoreB: 0 });
    expect(m.suddenDeath?.status).toBe("IN_PROGRESS");
  });

  it("resolves sudden death closer A", () => {
    let m = applyRegulationComplete(baseMatch(), {
      round1: { scoreA: 1, scoreB: 0 },
      round2: { scoreA: 0, scoreB: 1 },
    });
    m = applyExtraEightComplete(m, { scoreA: 0, scoreB: 0 });
    m = applySuddenDeathCloser(m, "A");
    expect(m.status).toBe("COMPLETED");
    expect(m.winnerTeamId).toBe("a");
  });
});
