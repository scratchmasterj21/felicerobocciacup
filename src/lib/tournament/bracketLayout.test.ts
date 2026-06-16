import { describe, expect, it } from "vitest";
import {
  buildFinalBracketMatchTree,
  buildResurrectionBracketMatchTree,
  buildSplitFinalBracketWithGradeChampionship,
} from "./bracketMatches";
import { isCascadeLadderGroup, useCompactLadderLayout } from "./bracketLayout";

describe("isCascadeLadderGroup", () => {
  it("detects cascade ladder for 5 seeds", () => {
    const tree = buildFinalBracketMatchTree("G6", ["s1", "s2", "s3", "s4", "s5"], "A");
    expect(isCascadeLadderGroup(tree, "A")).toBe(true);
  });

  it("rejects classic single-elim with multiple slots in round 0", () => {
    const tree = buildFinalBracketMatchTree("G1", ["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(isCascadeLadderGroup(tree, "U")).toBe(false);
  });

  it("rejects empty group", () => {
    expect(isCascadeLadderGroup([], "A")).toBe(false);
  });
});

describe("useCompactLadderLayout", () => {
  it("is true for split finals with ladder pools", () => {
    const split = buildSplitFinalBracketWithGradeChampionship("G6", ["a", "b", "c", "d", "e"], [
      "f",
      "g",
      "h",
      "i",
      "j",
    ]);
    expect(useCompactLadderLayout(split, true)).toBe(true);
  });

  it("is true for unified ladder", () => {
    const tree = buildFinalBracketMatchTree("G6", ["a", "b", "c", "d"], "U");
    expect(useCompactLadderLayout(tree, false)).toBe(true);
  });

  it("is false for classic single-elim tree with multiple round-0 matches", () => {
    const tree = buildResurrectionBracketMatchTree("G1", "A", ["a", "b", "c", "d"]);
    expect(useCompactLadderLayout(tree, false)).toBe(false);
  });
});
