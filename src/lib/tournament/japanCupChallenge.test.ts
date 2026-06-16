import { describe, expect, it } from "vitest";
import {
  buildJapanCupChallengeMatch,
  findGradeChampionshipMatch,
  findJapanCupChallengeMatch,
} from "./bracketMatches";
import type { FinalMatchData } from "./types";
import {
  excludeJapanCupChampion,
  getJapanCupChampionTeamId,
  isRegularPoolTeam,
  japanCupChampionTeamIdForGrade,
  resolveJapanCupChallengeDisplayMatch,
  resolveTrueGradeChampion,
  stripJapanCupChampionFromSeeds,
  teamInQualifyingForGrade,
  validateJapanCupChampionNotInBracket,
} from "./japanCupChallenge";

describe("excludeJapanCupChampion", () => {
  it("removes champion from seed list", () => {
    expect(excludeJapanCupChampion(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("strips from split seeds", () => {
    const out = stripJapanCupChampionFromSeeds(
      { A: ["a", "jc"], B: ["b", "jc"] },
      "jc"
    );
    expect(out).toEqual({ A: ["a"], B: ["b"] });
  });
});

describe("getJapanCupChampionTeamId", () => {
  it("returns id when enabled", () => {
    expect(
      getJapanCupChampionTeamId({
        japanCupChallenge: {
          enabled: true,
          championTeamId: "G1__JC",
          championName: "Japan Cup Winners",
        },
      })
    ).toBe("G1__JC");
  });

  it("returns undefined when disabled", () => {
    expect(
      getJapanCupChampionTeamId({
        japanCupChallenge: {
          enabled: false,
          championTeamId: "G1__JC",
          championName: "Japan Cup Winners",
        },
      })
    ).toBeUndefined();
  });

  it("derives id from grade when meta has no championTeamId", () => {
    expect(
      getJapanCupChampionTeamId(
        { japanCupChallenge: { enabled: true, championTeamId: "", championName: "x" } },
        "G2"
      )
    ).toBe("G2__JC");
  });
});

describe("japanCupChampionTeamIdForGrade", () => {
  it("uses deterministic suffix", () => {
    expect(japanCupChampionTeamIdForGrade("G1")).toBe("G1__JC");
  });
});

describe("isRegularPoolTeam", () => {
  it("excludes japan cup champion-only teams", () => {
    expect(isRegularPoolTeam({ japanCupChampionOnly: true })).toBe(false);
    expect(isRegularPoolTeam({})).toBe(true);
  });
});

describe("validateJapanCupChampionNotInBracket", () => {
  it("rejects team in qualifying", () => {
    const err = validateJapanCupChampionNotInBracket(
      "t1",
      "G1",
      {
        m1: {
          id: "m1",
          gradeId: "G1",
          divisionId: "A",
          round: 1,
          teamAId: "t1",
          teamBId: "t2",
          status: "SCHEDULED",
        },
      },
      null
    );
    expect(err).toContain("preliminary");
  });
});

describe("teamInQualifyingForGrade", () => {
  it("detects team in grade matches", () => {
    expect(
      teamInQualifyingForGrade("t1", "G1", {
        m1: {
          id: "m1",
          gradeId: "G1",
          divisionId: "A",
          round: 1,
          teamAId: "t1",
          teamBId: "t2",
          status: "SCHEDULED",
        },
      })
    ).toBe(true);
  });
});

describe("buildJapanCupChallengeMatch", () => {
  const gradeFinal: FinalMatchData = {
    id: "G1_R2_M0",
    gradeId: "G1",
    bracketGroup: "U",
    roundIndex: 2,
    slotInRound: 0,
    status: "COMPLETED",
    winnerTeamId: "win",
    feedsFromA: "a",
    feedsFromB: "b",
  };

  it("wires challenge after grade final", () => {
    const ch = buildJapanCupChallengeMatch("G1", gradeFinal, "jc", "win");
    expect(ch.matchKind).toBe("japanCupChallenge");
    expect(ch.roundIndex).toBe(3);
    expect(ch.teamBId).toBe("jc");
    expect(ch.teamAId).toBe("win");
    expect(ch.feedsFromA).toBe(gradeFinal.id);
  });
});

describe("resolveJapanCupChallengeDisplayMatch", () => {
  const gradeFinal: FinalMatchData = {
    id: "G1_R2_M0",
    gradeId: "G1",
    bracketGroup: "U",
    roundIndex: 2,
    slotInRound: 0,
    status: "COMPLETED",
    winnerTeamId: "gradeWin",
    feedsFromA: "a",
    feedsFromB: "b",
  };

  it("synthesizes preview when meta enabled but match node missing", () => {
    const m = resolveJapanCupChallengeDisplayMatch([], {
      japanCupChallenge: {
        enabled: true,
        championTeamId: "G1__JC",
        championName: "MechaShooters",
      },
    }, "G1");
    expect(m?.matchKind).toBe("japanCupChallenge");
    expect(m?.teamBId).toBe("G1__JC");
  });

  it("wires grade winner when grade final is complete", () => {
    const m = resolveJapanCupChallengeDisplayMatch([gradeFinal], {
      japanCupChallenge: {
        enabled: true,
        championTeamId: "G1__JC",
        championName: "MechaShooters",
      },
    }, "G1");
    expect(m?.teamAId).toBe("gradeWin");
    expect(m?.teamBId).toBe("G1__JC");
  });

  it("returns undefined when disabled despite orphan match", () => {
    expect(
      resolveJapanCupChallengeDisplayMatch(
        [
          {
            id: "jc",
            gradeId: "G1",
            matchKind: "japanCupChallenge",
            roundIndex: 3,
            slotInRound: 0,
            status: "SCHEDULED",
          },
        ],
        { japanCupChallenge: { enabled: false, championTeamId: "G1__JC", championName: "x" } },
        "G1"
      )
    ).toBeUndefined();
  });
});

describe("resolveTrueGradeChampion", () => {
  const gradeFinal: FinalMatchData = {
    id: "G1_R2_M0",
    gradeId: "G1",
    bracketGroup: "U",
    roundIndex: 2,
    slotInRound: 0,
    status: "COMPLETED",
    winnerTeamId: "gradeWin",
    feedsFromA: "a",
    feedsFromB: "b",
  };

  it("returns undefined when JC enabled but challenge incomplete", () => {
    expect(
      resolveTrueGradeChampion([gradeFinal], {
        japanCupChallenge: {
          enabled: true,
          championTeamId: "jc",
          championName: "JC",
        },
      })
    ).toBeUndefined();
  });

  it("uses challenge winner when complete", () => {
    const challenge: FinalMatchData = {
      id: "G1_R3_M0",
      gradeId: "G1",
      bracketGroup: "U",
      matchKind: "japanCupChallenge",
      roundIndex: 3,
      slotInRound: 0,
      status: "COMPLETED",
      winnerTeamId: "trueWin",
      teamAId: "gradeWin",
      teamBId: "jc",
    };
    expect(
      resolveTrueGradeChampion([gradeFinal, challenge], {
        japanCupChallenge: {
          enabled: true,
          championTeamId: "jc",
          championName: "JC",
        },
      })
    ).toBe("trueWin");
  });

  it("uses grade final when JC not enabled", () => {
    expect(resolveTrueGradeChampion([gradeFinal], {})).toBe("gradeWin");
  });
});

describe("findGradeChampionshipMatch", () => {
  it("finds split grade final", () => {
    const m = findGradeChampionshipMatch([
      {
        id: "gf",
        gradeId: "G1",
        bracketGroup: "U",
        roundIndex: 2,
        slotInRound: 0,
        status: "SCHEDULED",
        feedsFromA: "a",
        feedsFromB: "b",
      },
    ]);
    expect(m?.id).toBe("gf");
  });

  it("finds japan cup challenge separately", () => {
    const ch = findJapanCupChallengeMatch([
      {
        id: "jc",
        gradeId: "G1",
        matchKind: "japanCupChallenge",
        roundIndex: 3,
        slotInRound: 0,
        status: "SCHEDULED",
      },
    ]);
    expect(ch?.id).toBe("jc");
  });
});
