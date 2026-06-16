import { describe, expect, it } from "vitest";
import {
  findDuplicateTeamCodes,
  parseStudentCsvPaste,
  resolveTeamId,
} from "./teamResolve";

const teams = {
  "-FirebaseA": { code: "G1-A-01", name: "A", gradeId: "G1", divisionId: "A" },
  "-FirebaseB": { code: "g1-b-02", name: "B", gradeId: "G1", divisionId: "B" },
};

describe("resolveTeamId", () => {
  it("resolves direct firebase id", () => {
    expect(resolveTeamId(teams, "-FirebaseA")).toEqual({
      ok: true,
      teamId: "-FirebaseA",
    });
  });

  it("resolves team code case-insensitively", () => {
    expect(resolveTeamId(teams, "G1-A-01")).toEqual({
      ok: true,
      teamId: "-FirebaseA",
    });
    expect(resolveTeamId(teams, "g1-b-02")).toEqual({
      ok: true,
      teamId: "-FirebaseB",
    });
  });

  it("errors on unknown code", () => {
    const r = resolveTeamId(teams, "NOPE");
    expect(r.ok).toBe(false);
  });

  it("resolves team name when code is unset", () => {
    expect(resolveTeamId({ tid: { name: "FCA001" } }, "FCA001")).toEqual({
      ok: true,
      teamId: "tid",
    });
    expect(resolveTeamId({ tid: { name: "FCA001" } }, "fca001")).toEqual({
      ok: true,
      teamId: "tid",
    });
  });

  it("disambiguates duplicate codes by grade", () => {
    const dup = {
      t1: { code: "FCA001", name: "Alpha", gradeId: "G1", divisionId: "A" },
      t2: { code: "FCA001", name: "Beta", gradeId: "G2", divisionId: "A" },
    };
    expect(resolveTeamId(dup, "FCA001", { gradeId: "G1" })).toEqual({
      ok: true,
      teamId: "t1",
    });
  });

  it("disambiguates duplicate codes by division", () => {
    const dup = {
      t1: { code: "FCA001", name: "Alpha", gradeId: "G1", divisionId: "A" },
      t2: { code: "FCA001", name: "Beta", gradeId: "G1", divisionId: "B" },
    };
    expect(resolveTeamId(dup, "FCA001", { gradeId: "G1", divisionId: "B" })).toEqual({
      ok: true,
      teamId: "t2",
    });
  });
});

describe("findDuplicateTeamCodes", () => {
  it("lists codes used by multiple teams", () => {
    const dup = findDuplicateTeamCodes({
      a: { code: "FCA001", gradeId: "G1", divisionId: "A" },
      b: { code: "fca001", gradeId: "G1", divisionId: "B" },
    });
    expect(dup).toHaveLength(1);
    expect(dup[0].teamIds).toHaveLength(2);
  });
});

describe("parseStudentCsvPaste", () => {
  it("parses comma rows", () => {
    const r = parseStudentCsvPaste("s1,Yamada,G1-A-01\ns2,Lee,G1-A-01");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(2);
      expect(r.rows[0].studentId).toBe("s1");
    }
  });

  it("parses optional division column", () => {
    const r = parseStudentCsvPaste("s1,Yamada,FCA001,B");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0].divisionId).toBe("B");
  });

  it("skips header row", () => {
    const r = parseStudentCsvPaste(
      "studentId,name,teamCode\ns1,Yamada,G1-A-01"
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows).toHaveLength(1);
  });
});
