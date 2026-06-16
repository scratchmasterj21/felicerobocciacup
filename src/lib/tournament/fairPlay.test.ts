import { describe, expect, it } from "vitest";
import {
  buildFairPlayByTeamIdFromStudents,
  clampStudentFairPlayPoints,
  fairPlayBandForShare,
  isFairPlayLockedForGrade,
  isJapanCupEligible,
  reverseFairPlayDelta,
  splitFairPlayPool,
  sumFairPlayForTeam,
  teamHasInitializedFairPlay,
} from "./fairPlay";

describe("splitFairPlayPool", () => {
  it("splits 15 across 3 students as 5,5,5", () => {
    const m = splitFairPlayPool(["s3", "s1", "s2"]);
    expect(m.get("s1")).toEqual({ points: 5, initialShare: 5 });
    expect(m.get("s2")).toEqual({ points: 5, initialShare: 5 });
    expect(m.get("s3")).toEqual({ points: 5, initialShare: 5 });
  });

  it("splits 15 across 4 students as 4,4,4,3 by sorted id", () => {
    const m = splitFairPlayPool(["d", "a", "c", "b"]);
    expect(m.get("a")).toEqual({ points: 4, initialShare: 4 });
    expect(m.get("b")).toEqual({ points: 4, initialShare: 4 });
    expect(m.get("c")).toEqual({ points: 4, initialShare: 4 });
    expect(m.get("d")).toEqual({ points: 3, initialShare: 3 });
    const total = [...m.values()].reduce((s, v) => s + v.points, 0);
    expect(total).toBe(15);
  });

  it("splits 15 across 5 students as 3 each", () => {
    const m = splitFairPlayPool(["a", "b", "c", "d", "e"]);
    for (const v of m.values()) {
      expect(v).toEqual({ points: 3, initialShare: 3 });
    }
  });
});

describe("sumFairPlayForTeam", () => {
  const students = {
    s1: { name: "A", teamId: "t1", fairPlayPoints: 4, fairPlayInitialShare: 5 },
    s2: { name: "B", teamId: "t1", fairPlayPoints: 5, fairPlayInitialShare: 5 },
    s3: { name: "C", teamId: "t1", fairPlayPoints: 3, fairPlayInitialShare: 5 },
  };

  it("sums initialized roster", () => {
    expect(sumFairPlayForTeam(students, "t1")).toBe(12);
  });

  it("returns 0 when roster not initialized", () => {
    expect(
      sumFairPlayForTeam({ s1: { teamId: "t1", fairPlayPoints: 5 } }, "t1")
    ).toBe(0);
  });
});

describe("buildFairPlayByTeamIdFromStudents", () => {
  it("uses student sum when initialized, else team fallback", () => {
    const students = {
      s1: { teamId: "t1", fairPlayPoints: 4, fairPlayInitialShare: 5 },
      s2: { teamId: "t1", fairPlayPoints: 5, fairPlayInitialShare: 5 },
    };
    const teams = { t1: { fairPlayPoints: 15 }, t2: { fairPlayPoints: 10 } };
    const m = buildFairPlayByTeamIdFromStudents(students, ["t1", "t2"], teams);
    expect(m.get("t1")).toBe(9);
    expect(m.get("t2")).toBe(10);
  });
});

describe("clampStudentFairPlayPoints", () => {
  it("clamps to 0..initialShare", () => {
    expect(clampStudentFairPlayPoints(6, 5)).toBe(5);
    expect(clampStudentFairPlayPoints(-1, 4)).toBe(0);
    expect(clampStudentFairPlayPoints(3, 4)).toBe(3);
  });
});

describe("reverseFairPlayDelta", () => {
  it("undoes a deduction", () => {
    expect(reverseFairPlayDelta(3, -2, 5)).toBe(5);
  });

  it("undoes a credit", () => {
    expect(reverseFairPlayDelta(4, 1, 5)).toBe(3);
  });
});

describe("fairPlayBandForShare", () => {
  it("scales bands to share", () => {
    expect(fairPlayBandForShare(5, 5)).toBe("green");
    expect(fairPlayBandForShare(3, 5)).toBe("yellow");
    expect(fairPlayBandForShare(1, 5)).toBe("red");
  });
});

describe("isJapanCupEligible", () => {
  it("requires points > 0", () => {
    expect(isJapanCupEligible(1)).toBe(true);
    expect(isJapanCupEligible(0)).toBe(false);
    expect(isJapanCupEligible(undefined)).toBe(false);
  });
});

describe("isFairPlayLockedForGrade", () => {
  it("true when generatedAt set", () => {
    expect(isFairPlayLockedForGrade({ generatedAt: 1 })).toBe(true);
    expect(isFairPlayLockedForGrade(null)).toBe(false);
    expect(isFairPlayLockedForGrade({})).toBe(false);
  });
});

describe("teamHasInitializedFairPlay", () => {
  it("requires all roster members initialized", () => {
    const students = {
      s1: { teamId: "t1", fairPlayPoints: 5, fairPlayInitialShare: 5 },
      s2: { teamId: "t1", fairPlayPoints: 5, fairPlayInitialShare: 5 },
    };
    expect(teamHasInitializedFairPlay(students, "t1")).toBe(true);
    expect(
      teamHasInitializedFairPlay(
        { s1: { teamId: "t1", fairPlayPoints: 5 } },
        "t1"
      )
    ).toBe(false);
  });
});
