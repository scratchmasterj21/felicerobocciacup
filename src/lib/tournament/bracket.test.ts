import { describe, expect, it } from "vitest";
import { nextPowerOfTwo, buildFirstRoundSingleElim, resolveFirstRoundWinner } from "./bracket";
import {
  buildFinalBracketMatchTree,
  buildSplitFinalBracketWithGradeChampionship,
} from "./bracketMatches";

describe("nextPowerOfTwo", () => {
  it("pads to power of two", () => {
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
  });
});

describe("buildFirstRoundSingleElim", () => {
  it("creates half matches", () => {
    const fr = buildFirstRoundSingleElim(["a", "b", "c", "d"]);
    expect(fr.bracketSize).toBe(4);
    expect(fr.matches.length).toBe(2);
  });
});

describe("resolveFirstRoundWinner", () => {
  it("awards bye", () => {
    expect(
      resolveFirstRoundWinner(
        { kind: "team", teamId: "a" },
        { kind: "bye" }
      )
    ).toBe("a");
  });
});

describe("buildFinalBracketMatchTree", () => {
  it("has champion path for 4 teams", () => {
    const tree = buildFinalBracketMatchTree("G1", ["a", "b", "c", "d"]);
    const lastRound = Math.max(...tree.map((m) => m.roundIndex));
    const finals = tree.filter((m) => m.roundIndex === lastRound);
    expect(finals.length).toBe(1);
  });
});

describe("buildSplitFinalBracketWithGradeChampionship", () => {
  it("adds one grade final and links A/B champions to it", () => {
    const tree = buildSplitFinalBracketWithGradeChampionship(
      "G1",
      ["a1", "a2", "a3"],
      ["b1", "b2", "b3"]
    );
    const gradeFinals = tree.filter((m) => m.bracketGroup === "U");
    expect(gradeFinals).toHaveLength(1);
    const gradeFinal = gradeFinals[0];
    expect(gradeFinal.feedsFromA).toBeDefined();
    expect(gradeFinal.feedsFromB).toBeDefined();

    const aFinal = tree.find((m) => m.id === gradeFinal.feedsFromA);
    const bFinal = tree.find((m) => m.id === gradeFinal.feedsFromB);
    expect(aFinal?.bracketGroup).toBe("A");
    expect(bFinal?.bracketGroup).toBe("B");
    expect(aFinal?.nextMatchId).toBe(gradeFinal.id);
    expect(bFinal?.nextMatchId).toBe(gradeFinal.id);
  });

  it("does not create a third-place match", () => {
    const tree = buildSplitFinalBracketWithGradeChampionship(
      "G2",
      ["a1", "a2", "a3", "a4"],
      ["b1", "b2", "b3", "b4"]
    );
    expect(tree.filter((m) => m.bracketGroup === "U")).toHaveLength(1);
  });
});
