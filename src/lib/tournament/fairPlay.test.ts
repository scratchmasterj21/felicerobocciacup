import { describe, expect, it } from "vitest";
import {
  buildFairPlayByTeamIdFromStudents,
  clampStudentFairPlayPoints,
  fairPlayBandForShare,
  fairPlayPercentageForTeam,
  isFairPlayLockedForGrade,
  isJapanCupEligible,
  reverseFairPlayDelta,
  splitFairPlayPool,
  sumFairPlayForTeam,
  teamHasInitializedFairPlay,
} from "./fairPlay";

describe("splitFairPlayPool", () => {
  it("gives every student an equal personal balance of 15", () => {
    const m = splitFairPlayPool(["s3", "s1", "s2"]);
    expect(m.get("s1")).toEqual({ points: 15, initialShare: 15 });
    expect(m.get("s2")).toEqual({ points: 15, initialShare: 15 });
    expect(m.get("s3")).toEqual({ points: 15, initialShare: 15 });
  });

  it("does not vary the balance with roster size or student id", () => {
    const m = splitFairPlayPool(["d", "a", "c", "b"]);
    for (const v of m.values()) {
      expect(v).toEqual({ points: 15, initialShare: 15 });
    }
  });
});

describe("fairPlayPercentageForTeam", () => {
  it("compares differently sized rosters by remaining percentage", () => {
    const students = {
      a1: { teamId: "a", fairPlayPoints: 12, fairPlayInitialShare: 15 },
      a2: { teamId: "a", fairPlayPoints: 15, fairPlayInitialShare: 15 },
      b1: { teamId: "b", fairPlayPoints: 9, fairPlayInitialShare: 15 },
      b2: { teamId: "b", fairPlayPoints: 15, fairPlayInitialShare: 15 },
      b3: { teamId: "b", fairPlayPoints: 15, fairPlayInitialShare: 15 },
      b4: { teamId: "b", fairPlayPoints: 15, fairPlayInitialShare: 15 },
    };
    expect(fairPlayPercentageForTeam(students, "a")).toBe(90);
    expect(fairPlayPercentageForTeam(students, "b")).toBe(90);
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
    expect(m.get("t1")).toBe(90);
    expect(m.get("t2")).toBeCloseTo(66.7);
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
