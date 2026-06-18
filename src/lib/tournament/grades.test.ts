import { describe, expect, it } from "vitest";
import {
  defaultWorkingGrade,
  FELICE_CUP_GRADE_IDS,
  gradeLabel,
  isFeliceCupGradeId,
  isInterschoolGradeId,
  normalizeWorkingGrade,
  workingGradesForTournament,
} from "./grades";

describe("grades", () => {
  it("identifies Felice Cup grade ids", () => {
    expect(isFeliceCupGradeId("G3")).toBe(true);
    expect(isFeliceCupGradeId("IS")).toBe(false);
  });

  it("identifies interschool grade id", () => {
    expect(isInterschoolGradeId("IS")).toBe(true);
    expect(isInterschoolGradeId("G1")).toBe(false);
  });

  it("returns grade lists by tournament kind", () => {
    expect(workingGradesForTournament({ tournamentKind: "intraSchool" })).toEqual(
      FELICE_CUP_GRADE_IDS
    );
    expect(workingGradesForTournament({ tournamentKind: "interSchool" })).toEqual(["IS"]);
    expect(workingGradesForTournament(null)).toEqual(FELICE_CUP_GRADE_IDS);
  });

  it("defaults working grade", () => {
    expect(defaultWorkingGrade({ tournamentKind: "interSchool" })).toBe("IS");
    expect(defaultWorkingGrade({ tournamentKind: "intraSchool" })).toBe("G1");
  });

  it("labels IS as Interschool", () => {
    expect(gradeLabel("IS")).toBe("Interschool");
    expect(gradeLabel("G4")).toBe("G4");
  });

  it("normalizes invalid grade for tournament kind", () => {
    expect(normalizeWorkingGrade({ tournamentKind: "interSchool" }, "G6")).toBe("IS");
    expect(normalizeWorkingGrade({ tournamentKind: "intraSchool" }, "IS")).toBe("G1");
    expect(normalizeWorkingGrade({ tournamentKind: "intraSchool" }, "G3")).toBe("G3");
  });
});
