import { describe, expect, it } from "vitest";
import { createMatchesCsv, createPrintableResultsHtml, createTeamsCsv } from "./reporting";

const data = {
  meta: { name: "Felice <Cup>", schoolYear: 2026 },
  teams: { a: { name: "A, Team", gradeId: "G1", divisionId: "A" }, b: { name: "B Team", gradeId: "G1", divisionId: "A" } },
  qualifying: { matches: { m1: { teamAId: "a", teamBId: "b", status: "COMPLETED", divisionId: "A", regulation: { round1: { scoreA: 1, scoreB: 0 }, round2: { scoreA: 2, scoreB: 1 } } } } },
};

describe("tournament reporting", () => {
  it("escapes team CSV values", () => expect(createTeamsCsv(data)).toContain('"A, Team"'));
  it("includes readable match scores", () => expect(createMatchesCsv(data)).toContain("3-1"));
  it("escapes printable report markup", () => expect(createPrintableResultsHtml(data)).toContain("Felice &lt;Cup&gt;"));
});
