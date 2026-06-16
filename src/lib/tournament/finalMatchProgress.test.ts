import { describe, expect, it } from "vitest";
import type { FinalMatchData } from "@/lib/tournament/types";
import {
  finalMatchHasScores,
  pickJapanCupChallengeOnRegenerate,
} from "@/lib/tournament/finalMatchProgress";

function jcMatch(overrides: Partial<FinalMatchData> = {}): FinalMatchData {
  return {
    id: "G5__JC",
    gradeId: "G5",
    roundIndex: 99,
    slotInRound: 0,
    matchKind: "japanCupChallenge",
    status: "SCHEDULED",
    teamAId: "G5__A__1",
    teamBId: "G5__JC",
    ...overrides,
  };
}

describe("finalMatchHasScores", () => {
  it("is false for scheduled with no scores", () => {
    expect(finalMatchHasScores(jcMatch())).toBe(false);
  });

  it("is true for IN_PROGRESS", () => {
    expect(finalMatchHasScores(jcMatch({ status: "IN_PROGRESS" }))).toBe(true);
  });

  it("is true for COMPLETED", () => {
    expect(finalMatchHasScores(jcMatch({ status: "COMPLETED" }))).toBe(true);
  });

  it("is true when regulation scores exist", () => {
    expect(
      finalMatchHasScores(
        jcMatch({
          regulation: {
            round1: { scoreA: 1, scoreB: 0 },
            round2: { scoreA: 0, scoreB: 0 },
          },
        })
      )
    ).toBe(true);
  });
});

describe("pickJapanCupChallengeOnRegenerate", () => {
  it("keeps prior when same id and has scores", () => {
    const prior = jcMatch({
      status: "IN_PROGRESS",
      regulation: {
        round1: { scoreA: 2, scoreB: 1 },
        round2: { scoreA: 0, scoreB: 0 },
      },
    });
    const rebuilt = jcMatch({ teamAId: "G5__A__2" });
    expect(pickJapanCupChallengeOnRegenerate(prior, rebuilt)).toBe(prior);
  });

  it("uses rebuilt when prior has no scores", () => {
    const prior = jcMatch({ status: "SCHEDULED" });
    const rebuilt = jcMatch({ teamAId: "G5__A__2" });
    expect(pickJapanCupChallengeOnRegenerate(prior, rebuilt)).toBe(rebuilt);
  });

  it("uses rebuilt when ids differ", () => {
    const prior = jcMatch({ id: "old", status: "COMPLETED" });
    const rebuilt = jcMatch({ id: "new" });
    expect(pickJapanCupChallengeOnRegenerate(prior, rebuilt)).toBe(rebuilt);
  });
});
