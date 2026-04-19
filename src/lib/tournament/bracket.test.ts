import { describe, expect, it } from "vitest";
import { nextPowerOfTwo, buildFirstRoundSingleElim, resolveFirstRoundWinner } from "./bracket";
import { buildFinalBracketMatchTree } from "./bracketMatches";

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
