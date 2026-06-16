import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useTournamentId } from "@/hooks/useTournamentId";
import { useAuth } from "@/hooks/useAuth";
import { getFirebaseAuth } from "@/lib/firebase/config";
import {
  addStudent,
  bulkAddStudents,
  completeQualifyingMatch,
  createTournament,
  deleteTournamentMeta,
  deleteSchool,
  deleteFinalsForGrade,
  deleteQualifyingMatchesByIds,
  deleteResurrectionGroup,
  deleteTeam,
  generateFinalsForGrade,
  generateQualifyingRoundRobin,
  generateResurrectionBracket,
  pushSchool,
  pushTeam,
  subscribeSchools,
  submitFinalExtraEight,
  submitFinalRegulation,
  submitSuddenDeathCloser,
  subscribeFinalMatches,
  subscribeQualifyingMatches,
  subscribeResurrectionMatches,
  subscribeResurrectionMeta,
  subscribeTeams,
  subscribeTournamentMeta,
  getDivisionLeagueCount,
  getQualifyingLeagueAssignment,
  setQualifyingLeagueAssignment,
  updateFinalSchedule,
  updateDivisionLeagueCount,
  updateQualifyingSchedule,
  updateResurrectionSchedule,
  updateTeamSchool,
  updateTournamentMetaPartial,
  submitResurrectionRegulation,
  submitResurrectionExtraEight,
  submitResurrectionSuddenDeathCloser,
  setJapanCupChallengeEnabled,
} from "@/lib/firebase/tournamentService";
import type { FinalsGradeMeta } from "@/lib/tournament/japanCupChallenge";
import type {
  FinalMatchData,
  MatchSchedule,
  QualifyingMatchData,
  ResurrectionMeta,
  ResurrectionPoolGroup,
} from "@/lib/tournament/types";
import {
  compareFinalByRoundThenScheduleThenSlot,
  compareQualifyingByScheduleThenRound,
} from "@/lib/schedule/matchSort";
import {
  tokyoDatetimeLocalToUtcMs,
  utcMsToTokyoDatetimeLocalValue,
} from "@/lib/schedule/tokyo";
import {
  computeSeedsForGradeDivision,
  computeSeedsForGradeUnified,
} from "@/lib/tournament/gradeSeeds";
import {
  belowCutTeamIdsForDivision,
  belowCutTeamIdsForUnified,
} from "@/lib/tournament/resurrection";
import { regulationTotals } from "@/lib/tournament/roundRobin";
import { StandingsTable } from "@/components/StandingsTable";
import { FairPlayAdminSection } from "@/components/FairPlayAdminSection";
import {
  MatchScoreGrid,
  type GridFilter,
  type MatchScoreGridRow,
} from "@/components/MatchScoreGrid";
import { rankStandings } from "@/lib/tournament/standings";
import {
  isFairPlayEnabled,
  rankStandingsFairPlayOptions,
} from "@/lib/tournament/fairPlay";
import {
  subscribeFairPlayIncidents,
  subscribeFinalsGradeMeta,
  subscribeStudents,
} from "@/lib/firebase/fairPlayService";
import type { FairPlayIncident } from "@/lib/tournament/types";
import type {
  StudentRecord,
  TeamRecord,
  TournamentMeta,
} from "@/lib/firebase/tournamentService";
import {
  describeTeamMatch,
  describeExistingStudent,
  findDuplicateTeamCodes,
  filterStudentsByGrade,
  listAllStudents,
  listTeamCodes,
  parseStudentCsvPaste,
  teamCodeById,
} from "@/lib/tournament/teamResolve";
import {
  excludeJapanCupChampion,
  getJapanCupChampionTeamId,
  gradeChampionshipComplete,
  isRegularPoolTeam,
} from "@/lib/tournament/japanCupChallenge";
import { divisionLabel } from "@/lib/tournament/divisionLabels";
import {
  buildTeamDisplayNameById,
  schoolShortByIdFromRecord,
} from "@/lib/tournament/teamDisplay";
import {
  effectiveLeagueCount,
  partitionTeamsIntoLeaguesFromSaved,
  shuffleTeamsIntoLeagues,
} from "@/lib/tournament/leagueSplit";
import type { LeagueId } from "@/lib/tournament/leagueSplit";
import { MatchSectionToolbar } from "@/components/MatchSectionToolbar";
import {
  JapanCupChallengeScoring,
  JapanCupConfigPanel,
} from "@/components/JapanCupFinalsBlock";
import { buildLiveViewHref } from "@/lib/viewerDisplay";
import { finalMatchHasScores } from "@/lib/tournament/finalMatchProgress";

const GRADES = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;

/** Set `VITE_SHOW_STUDENTS=true` in `.env.local` to show the Students admin block. */
const SHOW_STUDENTS_SECTION = import.meta.env.VITE_SHOW_STUDENTS === "true";

export function AdminDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [tournamentId, setTournamentId] = useTournamentId();
  const [meta, setMeta] = useState<{
    name: string;
    schoolYear: number;
    tournamentKind?: "intraSchool" | "interSchool";
    divisionLabelA?: string;
    divisionLabelB?: string;
    qualifyingMode?: "twoPools" | "unified";
    qualifyingLeagueCountByDivision?: Record<string, 1 | 2>;
    qualifyingLeagueAssignmentsByDivision?: Record<
      string,
      Record<string, LeagueId>
    >;
  } | null>(null);
  const [teams, setTeams] = useState<
    Record<
      string,
      {
        gradeId: string;
        divisionId: "A" | "B";
        name: string;
        code?: string;
        schoolId?: string;
        fairPlayPoints?: number;
      }
    >
  | null>(null);
  const [students, setStudents] = useState<Record<string, StudentRecord> | null>(null);
  const [fairPlayIncidents, setFairPlayIncidents] = useState<
    Record<string, FairPlayIncident> | null
  >(null);
  const [schools, setSchools] = useState<
    Record<string, { name: string; shortLabel?: string }> | null
  >(null);
  const [qMatches, setQMatches] = useState<Record<string, QualifyingMatchData> | null>(null);
  const [grade, setGrade] = useState("G1");
  const [liveUrlCopied, setLiveUrlCopied] = useState(false);
  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);
  const [fMatches, setFMatches] = useState<Record<string, FinalMatchData> | null>(null);
  const [finalsGradeMeta, setFinalsGradeMeta] = useState<FinalsGradeMeta | null>(null);
  const [jcEnabled, setJcEnabled] = useState(false);
  const [jcChampionName, setJcChampionName] = useState("");
  const [jcBusy, setJcBusy] = useState(false);
  const [jcStatus, setJcStatus] = useState<string | null>(null);

  const [newTournamentName, setNewTournamentName] = useState("Felice Roboccia Cup 2026");
  const [newSchoolYear, setNewSchoolYear] = useState(2026);
  const [newTournamentKind, setNewTournamentKind] = useState<
    "intraSchool" | "interSchool"
  >("intraSchool");

  const [teamNameA, setTeamNameA] = useState("");
  const [teamCodeA, setTeamCodeA] = useState("");
  const [teamSchoolIdA, setTeamSchoolIdA] = useState("");
  const [teamNameB, setTeamNameB] = useState("");
  const [teamCodeB, setTeamCodeB] = useState("");
  const [teamSchoolIdB, setTeamSchoolIdB] = useState("");

  const [metaLabelA, setMetaLabelA] = useState("");
  const [metaLabelB, setMetaLabelB] = useState("");
  const [metaSchoolYear, setMetaSchoolYear] = useState(2026);
  const [metaQualifyingMode, setMetaQualifyingMode] = useState<
    "twoPools" | "unified"
  >("twoPools");
  const [leagueCountA, setLeagueCountA] = useState<1 | 2>(1);
  const [leagueCountB, setLeagueCountB] = useState<1 | 2>(1);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSchoolShort, setNewSchoolShort] = useState("");

  const [seedPreview, setSeedPreview] = useState<
    string[] | { A: string[]; B: string[] } | null
  >(null);
  const [appendResurrectionToFinals, setAppendResurrectionToFinals] =
    useState(false);
  const [resMetaA, setResMetaA] = useState<ResurrectionMeta | null>(null);
  const [resMetaB, setResMetaB] = useState<ResurrectionMeta | null>(null);
  const [resMetaU, setResMetaU] = useState<ResurrectionMeta | null>(null);
  const [resMatchesA, setResMatchesA] = useState<Record<
    string,
    FinalMatchData
  > | null>(null);
  const [resMatchesB, setResMatchesB] = useState<Record<
    string,
    FinalMatchData
  > | null>(null);
  const [resMatchesU, setResMatchesU] = useState<Record<
    string,
    FinalMatchData
  > | null>(null);
  const [qualViewMode, setQualViewMode] = useState<"cards" | "quick">("cards");
  const [resViewMode, setResViewMode] = useState<"cards" | "quick">("cards");
  const [finalsViewMode, setFinalsViewMode] = useState<"cards" | "quick">("cards");
  const [qualFilter, setQualFilter] = useState<GridFilter>("unfinished");
  const [resFilter, setResFilter] = useState<GridFilter>("unfinished");
  const [finalsFilter, setFinalsFilter] = useState<GridFilter>("unfinished");

  const liveViewHref = useMemo(
    () => buildLiveViewHref(tournamentId, grade),
    [tournamentId, grade]
  );
  const liveViewDisplayUrl = useMemo(
    () => `${window.location.origin}${liveViewHref}`,
    [liveViewHref]
  );

  const fairPlayTeacherHref = useMemo(() => {
    const p = new URLSearchParams();
    if (tournamentId.trim()) p.set("tournamentId", tournamentId.trim());
    const q = p.toString();
    return q ? `/fair-play?${q}` : "/fair-play";
  }, [tournamentId]);

  useEffect(() => {
    const tid = searchParams.get("tournamentId")?.trim();
    if (tid) setTournamentId(tid);
  }, [searchParams, setTournamentId]);

  useEffect(() => {
    return subscribeTournamentMeta(tournamentId, setMeta);
  }, [tournamentId]);
  useEffect(() => {
    if (!meta) return;
    setMetaLabelA(meta.divisionLabelA ?? "");
    setMetaLabelB(meta.divisionLabelB ?? "");
    const y = Number(meta.schoolYear);
    setMetaSchoolYear(Number.isFinite(y) ? y : 2026);
    setMetaQualifyingMode(
      meta.qualifyingMode === "unified" ? "unified" : "twoPools"
    );
    setLeagueCountA(getDivisionLeagueCount(meta, grade, "A"));
    setLeagueCountB(getDivisionLeagueCount(meta, grade, "B"));
  }, [meta]);
  useEffect(() => {
    setLeagueCountA(getDivisionLeagueCount(meta, grade, "A"));
    setLeagueCountB(getDivisionLeagueCount(meta, grade, "B"));
  }, [meta, grade]);

  const isInterSchoolTournament = meta?.tournamentKind === "interSchool";
  const fairPlayEnabled = isFairPlayEnabled(meta);
  const isUnified =
    meta?.qualifyingMode === "unified" || isInterSchoolTournament;
  const fpOpts = (teamIds: string[]) =>
    rankStandingsFairPlayOptions(students, teamIds, fairPlayEnabled, teams);
  useEffect(() => {
    return subscribeTeams(tournamentId, setTeams);
  }, [tournamentId]);
  useEffect(() => {
    if (!fairPlayEnabled && !SHOW_STUDENTS_SECTION) {
      setStudents(null);
      setFairPlayIncidents(null);
      return;
    }
    const uStudents = subscribeStudents(tournamentId, setStudents);
    if (!fairPlayEnabled) {
      return () => uStudents();
    }
    const u2 = subscribeFairPlayIncidents(tournamentId, setFairPlayIncidents);
    return () => {
      uStudents();
      u2();
    };
  }, [tournamentId, fairPlayEnabled]);
  useEffect(() => {
    return subscribeSchools(tournamentId, setSchools);
  }, [tournamentId]);
  useEffect(() => {
    return subscribeQualifyingMatches(tournamentId, setQMatches);
  }, [tournamentId]);
  useEffect(() => {
    return subscribeFinalMatches(tournamentId, grade, setFMatches);
  }, [tournamentId, grade]);
  useEffect(() => {
    return subscribeFinalsGradeMeta(tournamentId, grade, setFinalsGradeMeta);
  }, [tournamentId, grade]);
  useEffect(() => {
    setJcEnabled(finalsGradeMeta?.japanCupChallenge?.enabled ?? false);
    setJcChampionName(finalsGradeMeta?.japanCupChallenge?.championName ?? "");
  }, [
    finalsGradeMeta?.japanCupChallenge?.enabled,
    finalsGradeMeta?.japanCupChallenge?.championName,
  ]);
  useEffect(() => {
    if (isUnified) {
      setResMetaA(null);
      setResMatchesA(null);
      setResMetaB(null);
      setResMatchesB(null);
      return subscribeResurrectionMeta(tournamentId, grade, "U", setResMetaU);
    }
    setResMetaU(null);
    setResMatchesU(null);
    const u1 = subscribeResurrectionMeta(tournamentId, grade, "A", setResMetaA);
    const u2 = subscribeResurrectionMeta(tournamentId, grade, "B", setResMetaB);
    return () => {
      u1();
      u2();
    };
  }, [tournamentId, grade, isUnified]);
  useEffect(() => {
    if (isUnified) {
      return subscribeResurrectionMatches(
        tournamentId,
        grade,
        "U",
        setResMatchesU
      );
    }
    const u1 = subscribeResurrectionMatches(
      tournamentId,
      grade,
      "A",
      setResMatchesA
    );
    const u2 = subscribeResurrectionMatches(
      tournamentId,
      grade,
      "B",
      setResMatchesB
    );
    return () => {
      u1();
      u2();
    };
  }, [tournamentId, grade, isUnified]);

  const teamList = useMemo(() => {
    if (!teams) return [];
    return Object.entries(teams).map(([id, t]) => ({ id, ...t }));
  }, [teams]);

  /** Regular pool teams only — excludes Japan Cup champion-only registration. */
  const poolTeamList = useMemo(
    () => teamList.filter((t) => isRegularPoolTeam(t)),
    [teamList]
  );

  const schoolShortById = useMemo(
    () => schoolShortByIdFromRecord(schools),
    [schools]
  );

  const nameById = useMemo(
    () => buildTeamDisplayNameById(teamList, schoolShortById),
    [teamList, schoolShortById]
  );

  const teamsInGradeDiv = (g: string, d: "A" | "B") =>
    poolTeamList.filter((t) => t.gradeId === g && t.divisionId === d).map((t) => t.id);

  const jcChampionTeamId = useMemo(
    () => getJapanCupChampionTeamId(finalsGradeMeta, grade),
    [finalsGradeMeta, grade]
  );

  /** Teams eligible for prelim / finals / redemption (excludes Japan Cup champion-only team). */
  const teamsForBracket = (g: string, d: "A" | "B") =>
    excludeJapanCupChampion(teamsInGradeDiv(g, d), jcChampionTeamId);

  const teamsRowsFor = (d: "A" | "B") =>
    poolTeamList.filter((t) => t.gradeId === grade && t.divisionId === d);

  const mixedSchoolsInPool = useMemo(() => {
    const check = (d: "A" | "B") => {
      const ids = poolTeamList
        .filter((t) => t.gradeId === grade && t.divisionId === d)
        .map((t) => t.schoolId)
        .filter((x): x is string => Boolean(x));
      return new Set(ids).size > 1;
    };
    return { A: check("A"), B: check("B") };
  }, [poolTeamList, grade]);

  const matchesForDiv = (d: "A" | "B") =>
    Object.values(qMatches ?? {}).filter(
      (m) => m.gradeId === grade && m.divisionId === d
    );

  const requestedLeagueCountFor = (d: "A" | "B"): 1 | 2 =>
    d === "A" ? leagueCountA : leagueCountB;
  const effectiveLeagueCountFor = (d: "A" | "B"): 1 | 2 =>
    effectiveLeagueCount(requestedLeagueCountFor(d), teamsForBracket(grade, d).length);
  const leagueTeamsFor = (d: "A" | "B"): { L1: string[]; L2: string[] } => {
    const ids = teamsForBracket(grade, d);
    if (effectiveLeagueCountFor(d) === 1) return { L1: ids, L2: [] };
    return partitionTeamsIntoLeaguesFromSaved(
      ids,
      getQualifyingLeagueAssignment(meta, grade, d)
    );
  };
  const matchesForDivLeague = (d: "A" | "B", leagueId: "L1" | "L2") =>
    matchesForDiv(d).filter((m) => (m.leagueId ?? "L1") === leagueId);

  const standA = useMemo(() => {
    const ids = poolTeamList
      .filter((t) => t.gradeId === grade && t.divisionId === "A")
      .map((t) => t.id);
    const mq = Object.values(qMatches ?? {}).filter(
      (m) => m.gradeId === grade && m.divisionId === "A"
    );
    return rankStandings(ids, mq, fpOpts(ids));
  }, [poolTeamList, qMatches, grade, teams, students, fairPlayEnabled]);

  const standB = useMemo(() => {
    const ids = poolTeamList
      .filter((t) => t.gradeId === grade && t.divisionId === "B")
      .map((t) => t.id);
    const mq = Object.values(qMatches ?? {}).filter(
      (m) => m.gradeId === grade && m.divisionId === "B"
    );
    return rankStandings(ids, mq, fpOpts(ids));
  }, [poolTeamList, qMatches, grade, teams, students, fairPlayEnabled]);
  const standA_L1 = useMemo(
    () =>
      rankStandings(
        leagueTeamsFor("A").L1,
        matchesForDivLeague("A", "L1"),
        fpOpts(leagueTeamsFor("A").L1)
      ),
    [poolTeamList, qMatches, grade, leagueCountA, meta, teams, students, fairPlayEnabled]
  );
  const standA_L2 = useMemo(
    () =>
      rankStandings(
        leagueTeamsFor("A").L2,
        matchesForDivLeague("A", "L2"),
        fpOpts(leagueTeamsFor("A").L2)
      ),
    [poolTeamList, qMatches, grade, leagueCountA, meta, teams, students, fairPlayEnabled]
  );
  const standB_L1 = useMemo(
    () =>
      rankStandings(
        leagueTeamsFor("B").L1,
        matchesForDivLeague("B", "L1"),
        fpOpts(leagueTeamsFor("B").L1)
      ),
    [poolTeamList, qMatches, grade, leagueCountB, meta, teams, students, fairPlayEnabled]
  );
  const standB_L2 = useMemo(
    () =>
      rankStandings(
        leagueTeamsFor("B").L2,
        matchesForDivLeague("B", "L2"),
        fpOpts(leagueTeamsFor("B").L2)
      ),
    [poolTeamList, qMatches, grade, leagueCountB, meta, teams, students, fairPlayEnabled]
  );
  const finalsAll = useMemo(() => Object.values(fMatches ?? {}), [fMatches]);
  const finalsA = useMemo(
    () =>
      finalsAll.filter(
        (m) => m.bracketGroup === "A" || (!isUnified && m.bracketGroup == null)
      ),
    [finalsAll, isUnified]
  );
  const finalsB = useMemo(
    () => finalsAll.filter((m) => m.bracketGroup === "B"),
    [finalsAll]
  );
  const finalsUnified = useMemo(
    () =>
      finalsAll.filter(
        (m) =>
          (m.bracketGroup === "U" || m.bracketGroup == null) &&
          m.matchKind !== "japanCupChallenge"
      ),
    [finalsAll]
  );
  const finalsJapanCupChallenge = useMemo(
    () => finalsAll.filter((m) => m.matchKind === "japanCupChallenge"),
    [finalsAll]
  );
  const gradeFinalComplete = useMemo(
    () => gradeChampionshipComplete(finalsAll),
    [finalsAll]
  );
  const jcChallengeHasProgress = useMemo(
    () =>
      finalsJapanCupChallenge.some(
        (m) =>
          m.status === "COMPLETED" ||
          m.status === "IN_PROGRESS" ||
          Boolean(m.regulation || m.extra8min || m.suddenDeath)
      ),
    [finalsJapanCupChallenge]
  );
  const jcExistingDataWarning = useMemo(
    () =>
      Boolean(finalsGradeMeta?.generatedAt) ||
      Object.values(qMatches ?? {}).some((m) => m.gradeId === grade),
    [finalsGradeMeta, qMatches, grade]
  );

  const belowCutA = useMemo(
    () =>
      belowCutTeamIdsForDivision(
        grade,
        "A",
        teamsForBracket(grade, "A"),
        Object.values(qMatches ?? {}),
        effectiveLeagueCountFor("A"),
        getQualifyingLeagueAssignment(meta, grade, "A"),
        fpOpts(teamsForBracket(grade, "A"))
      ),
    [grade, qMatches, leagueCountA, poolTeamList, meta, teams, students, fairPlayEnabled]
  );
  const belowCutB = useMemo(
    () =>
      belowCutTeamIdsForDivision(
        grade,
        "B",
        teamsForBracket(grade, "B"),
        Object.values(qMatches ?? {}),
        effectiveLeagueCountFor("B"),
        getQualifyingLeagueAssignment(meta, grade, "B"),
        fpOpts(teamsForBracket(grade, "B"))
      ),
    [grade, qMatches, leagueCountB, poolTeamList, meta, teams, students, fairPlayEnabled]
  );
  const belowCutU = useMemo(
    () =>
      belowCutTeamIdsForUnified(
        grade,
        teamsForBracket(grade, "A"),
        Object.values(qMatches ?? {}),
        fpOpts(teamsForBracket(grade, "A"))
      ),
    [grade, qMatches, poolTeamList, teams, students, fairPlayEnabled]
  );

  function unfinishedFirst<T extends { status: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => {
      const au = a.status === "COMPLETED" ? 1 : 0;
      const bu = b.status === "COMPLETED" ? 1 : 0;
      return au - bu;
    });
  }

  function applyGridFilter<T extends { status: string }>(
    arr: T[],
    filter: GridFilter
  ): T[] {
    if (filter === "unfinished") return arr.filter((m) => m.status !== "COMPLETED");
    if (filter === "completed") return arr.filter((m) => m.status === "COMPLETED");
    return arr;
  }

  const qualRowsForDiv = (d: "A" | "B"): MatchScoreGridRow[] => {
    const base = unfinishedFirst(
      [...matchesForDiv(d)].sort(compareQualifyingByScheduleThenRound)
    );
    return applyGridFilter(base, qualFilter).map((m) => {
      const reg = m.regulation;
      const done = m.status === "COMPLETED" && Boolean(m.outcome) && Boolean(reg);
      const totals = reg ? regulationTotals(reg) : null;
      return {
        id: `q:${m.id}`,
        matchId: m.id,
        teamA: nameById.get(m.teamAId) ?? m.teamAId,
        teamB: nameById.get(m.teamBId) ?? m.teamBId,
        status: done ? "completed" : "pending",
        statusText: done
          ? `Completed ${totals?.totalA ?? 0}-${totals?.totalB ?? 0} (${m.outcome})`
          : "Pending",
        fields: [
          { key: "r1a", label: "R1 A", value: reg?.round1.scoreA ?? 0 },
          { key: "r1b", label: "R1 B", value: reg?.round1.scoreB ?? 0 },
          { key: "r2a", label: "R2 A", value: reg?.round2.scoreA ?? 0 },
          { key: "r2b", label: "R2 B", value: reg?.round2.scoreB ?? 0 },
        ],
      };
    });
  };

  function renderQualifyingEditorsByRound(divisionId: "A" | "B") {
    const sorted = [...matchesForDiv(divisionId)].sort(
      compareQualifyingByScheduleThenRound
    );
    if (sorted.length === 0) {
      return <p className="text-xs text-cup-muted py-2">No matches yet.</p>;
    }
    const rounds = [...new Set(sorted.map((m) => m.round))].sort((a, b) => a - b);
    return (
      <div className="space-y-4">
        {rounds.map((round) => (
          <section key={`${divisionId}-round-${round}`} className="space-y-2">
            <h4 className="text-xs font-semibold text-cup-muted border-b border-cup-line pb-1">
              Match {round} (R{round})
            </h4>
            <div className="space-y-3">
              {sorted
                .filter((m) => m.round === round)
                .map((m) => (
                  <QualifyingMatchEditor
                    key={m.id}
                    m={m}
                    nameById={nameById}
                    onSave={async (reg) => {
                      await completeQualifyingMatch(tournamentId, m.id, reg);
                    }}
                  />
                ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  const resRowsForGroup = (
    group: ResurrectionPoolGroup,
    list: FinalMatchData[]
  ): MatchScoreGridRow[] => {
    const base = unfinishedFirst([...list].sort(compareFinalByRoundThenScheduleThenSlot));
    return applyGridFilter(base, resFilter).map((m) => {
      const teamA = m.teamAId ? nameById.get(m.teamAId) ?? m.teamAId : "—";
      const teamB = m.teamBId ? nameById.get(m.teamBId) ?? m.teamBId : "—";
      if (!m.teamAId || !m.teamBId) {
        return {
          id: `res:${group}:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "blocked",
          statusText: "Waiting for teams",
          fields: [
            { key: "sA", label: "A", value: 0 },
            { key: "sB", label: "B", value: 0 },
          ],
        };
      }
      if (m.status === "COMPLETED" && m.winnerTeamId) {
        return {
          id: `res:${group}:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "completed",
          statusText: `Winner: ${nameById.get(m.winnerTeamId) ?? m.winnerTeamId}`,
          fields: [
            { key: "sA", label: "A", value: m.regulation?.round1.scoreA ?? 0 },
            { key: "sB", label: "B", value: m.regulation?.round1.scoreB ?? 0 },
          ],
        };
      }
      const totals = m.regulation ? regulationTotals(m.regulation) : null;
      const needExtra =
        Boolean(m.regulation) &&
        totals != null &&
        totals.totalA === totals.totalB &&
        !m.extra8min &&
        !m.suddenDeath;
      if (!m.regulation) {
        return {
          id: `res:${group}:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "pending",
          statusText: "Enter regulation (3 min)",
          fields: [
            { key: "sA", label: "Reg A", value: 0 },
            { key: "sB", label: "Reg B", value: 0 },
          ],
        };
      }
      if (needExtra) {
        return {
          id: `res:${group}:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "pending",
          statusText: "Tie: enter extra",
          fields: [
            { key: "sA", label: "Ex A", value: m.extra8min?.round?.scoreA ?? 0 },
            { key: "sB", label: "Ex B", value: m.extra8min?.round?.scoreB ?? 0 },
          ],
        };
      }
      return {
        id: `res:${group}:${m.id}`,
        matchId: m.id,
        teamA,
        teamB,
        status: "blocked",
        statusText: "Use Cards for sudden death/advanced state",
        fields: [
          { key: "sA", label: "A", value: 0 },
          { key: "sB", label: "B", value: 0 },
        ],
      };
    });
  };

  const finalsRows = (list: FinalMatchData[]): MatchScoreGridRow[] => {
    const base = unfinishedFirst([...list].sort(compareFinalByRoundThenScheduleThenSlot));
    return applyGridFilter(base, finalsFilter).map((m) => {
      const teamA = m.teamAId ? nameById.get(m.teamAId) ?? m.teamAId : "—";
      const teamB = m.teamBId ? nameById.get(m.teamBId) ?? m.teamBId : "—";
      if (!m.teamAId || !m.teamBId) {
        return {
          id: `f:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "blocked",
          statusText: "Waiting for teams",
          fields: [
            { key: "r1a", label: "R1 A", value: 0 },
            { key: "r1b", label: "R1 B", value: 0 },
            { key: "r2a", label: "R2 A", value: 0 },
            { key: "r2b", label: "R2 B", value: 0 },
          ],
        };
      }
      if (m.status === "COMPLETED" && m.winnerTeamId) {
        return {
          id: `f:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "completed",
          statusText: `Winner: ${nameById.get(m.winnerTeamId) ?? m.winnerTeamId}`,
          fields: [
            { key: "r1a", label: "R1 A", value: m.regulation?.round1.scoreA ?? 0 },
            { key: "r1b", label: "R1 B", value: m.regulation?.round1.scoreB ?? 0 },
            { key: "r2a", label: "R2 A", value: m.regulation?.round2.scoreA ?? 0 },
            { key: "r2b", label: "R2 B", value: m.regulation?.round2.scoreB ?? 0 },
          ],
        };
      }
      const totals = m.regulation ? regulationTotals(m.regulation) : null;
      const needExtra =
        Boolean(m.regulation) &&
        totals != null &&
        totals.totalA === totals.totalB &&
        !m.extra8min &&
        !m.suddenDeath;
      if (!m.regulation) {
        return {
          id: `f:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "pending",
          statusText: "Enter regulation",
          fields: [
            { key: "r1a", label: "R1 A", value: 0 },
            { key: "r1b", label: "R1 B", value: 0 },
            { key: "r2a", label: "R2 A", value: 0 },
            { key: "r2b", label: "R2 B", value: 0 },
          ],
        };
      }
      if (needExtra) {
        return {
          id: `f:${m.id}`,
          matchId: m.id,
          teamA,
          teamB,
          status: "pending",
          statusText: "Tie: enter extra",
          fields: [
            { key: "exA", label: "Ex A", value: m.extra8min?.round?.scoreA ?? 0 },
            { key: "exB", label: "Ex B", value: m.extra8min?.round?.scoreB ?? 0 },
          ],
        };
      }
      return {
        id: `f:${m.id}`,
        matchId: m.id,
        teamA,
        teamB,
        status: "blocked",
        statusText: "Use Cards for sudden death/advanced state",
        fields: [
          { key: "r1a", label: "R1 A", value: 0 },
          { key: "r1b", label: "R1 B", value: 0 },
          { key: "r2a", label: "R2 A", value: 0 },
          { key: "r2b", label: "R2 B", value: 0 },
        ],
      };
    });
  };

  async function onCreateTournament(e: FormEvent) {
    e.preventDefault();
    await createTournament(tournamentId, {
      name: newTournamentName.trim(),
      schoolYear: newSchoolYear,
      createdAt: Date.now(),
      tournamentKind: newTournamentKind,
      ...(newTournamentKind === "interSchool"
        ? { qualifyingMode: "unified" as const }
        : {}),
    });
  }

  async function onSaveSchoolYear(e: FormEvent) {
    e.preventDefault();
    const y = Math.round(metaSchoolYear);
    if (!Number.isFinite(y) || y < 1900 || y > 2100) {
      window.alert("Enter a school year between 1900 and 2100.");
      return;
    }
    await updateTournamentMetaPartial(tournamentId, { schoolYear: y });
  }

  async function onSaveDivisionLabels(e: FormEvent) {
    e.preventDefault();
    await updateTournamentMetaPartial(tournamentId, {
      divisionLabelA: metaLabelA.trim() || null,
      divisionLabelB: metaLabelB.trim() || null,
    });
  }

  async function onSaveQualifyingMode(e: FormEvent) {
    e.preventDefault();
    await updateTournamentMetaPartial(tournamentId, {
      qualifyingMode: metaQualifyingMode === "unified" ? "unified" : null,
    });
  }

  async function onDeleteTournamentMeta() {
    if (
      !window.confirm(
        "Delete tournament meta only? The tournament node name, year, and settings will be removed. Teams, preliminary matches, and finals data under this tournament ID will NOT be deleted."
      )
    ) {
      return;
    }
    await deleteTournamentMeta(tournamentId);
  }

  async function onAddSchool(e: FormEvent) {
    e.preventDefault();
    const n = newSchoolName.trim();
    if (!n) return;
    await pushSchool(tournamentId, {
      name: n,
      ...(newSchoolShort.trim() ? { shortLabel: newSchoolShort.trim() } : {}),
    });
    setNewSchoolName("");
    setNewSchoolShort("");
  }

  async function onDeleteSchoolRow(schoolId: string, label: string) {
    if (!window.confirm(`Delete school "${label}"? Teams that reference it will keep schoolId until you change them.`)) {
      return;
    }
    await deleteSchool(tournamentId, schoolId);
  }

  async function onAddTeamDivision(
    e: FormEvent,
    divisionId: "A" | "B",
    name: string,
    code: string
  ) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const c = code.trim();
    if (c && teams) {
      const dup = Object.entries(teams).find(
        ([, t]) => t.code?.trim().toLowerCase() === c.toLowerCase()
      );
      if (dup) {
        window.alert(
          `Code "${c}" is already used by ${describeTeamMatch(dup[0], teams)}. Each team needs a unique code.`
        );
        return;
      }
    }
    const sid =
      divisionId === "A" ? teamSchoolIdA.trim() : teamSchoolIdB.trim();
    await pushTeam(tournamentId, {
      gradeId: grade,
      divisionId,
      name: n,
      ...(code.trim() ? { code: code.trim() } : {}),
      ...(sid ? { schoolId: sid } : {}),
    });
    if (divisionId === "A") {
      setTeamNameA("");
      setTeamCodeA("");
    } else {
      setTeamNameB("");
      setTeamCodeB("");
    }
  }

  async function onDeleteTeam(teamId: string, teamName: string) {
    if (
      !window.confirm(
        `Delete team "${teamName}"? This cannot be undone. Preliminary results involving this team will become inconsistent unless you clear that division’s round-robin.`
      )
    ) {
      return;
    }
    await deleteTeam(tournamentId, teamId);
  }

  async function copyTeamViewerLink(teamId: string) {
    const path = `/t/${encodeURIComponent(tournamentId)}/team/${encodeURIComponent(teamId)}`;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTeamId(teamId);
      window.setTimeout(() => setCopiedTeamId(null), 2000);
    } catch {
      window.prompt("Copy this team link:", url);
    }
  }

  async function onClearRoundRobin(divisionId: "A" | "B") {
    const ids = matchesForDiv(divisionId).map((m) => m.id);
    if (ids.length === 0) {
      window.alert(`No ${grade}${divisionId} preliminary matches to delete.`);
      return;
    }
    if (
      !window.confirm(
        `Delete all ${grade}${divisionId} round-robin matches (${ids.length})? You can generate them again afterward.`
      )
    ) {
      return;
    }
    await deleteQualifyingMatchesByIds(tournamentId, ids);
  }

  async function onClearFinalsBracket() {
    const jcNote = finalsGradeMeta?.japanCupChallenge?.enabled
      ? " Japan Cup challenge settings and the defending champion team will be kept."
      : "";
    if (
      !window.confirm(
        `Delete all ${grade} finals matches? Bracket seeds and generatedAt will be cleared.${jcNote} You can regenerate from Preview seeds when ready.`
      )
    ) {
      return;
    }
    await deleteFinalsForGrade(tournamentId, grade);
    setSeedPreview(null);
  }

  async function onCopyLiveViewUrl() {
    try {
      const url = `${window.location.origin}${liveViewHref}`;
      await navigator.clipboard.writeText(url);
      setLiveUrlCopied(true);
      window.setTimeout(() => setLiveUrlCopied(false), 2000);
    } catch {
      window.alert("Could not copy URL.");
    }
  }

  async function onSaveDivisionLeagueCount(divisionId: "A" | "B") {
    const requested = requestedLeagueCountFor(divisionId);
    await updateDivisionLeagueCount(tournamentId, grade, divisionId, requested);
    if (
      requested === 2 &&
      teamsForBracket(grade, divisionId).length < 4
    ) {
      window.alert(
        `Saved 2-league mode for ${grade}${divisionId}. It will auto-fallback to 1 league until at least 4 teams are in this division.`
      );
    } else {
      window.alert(`Saved league count for ${grade}${divisionId}.`);
    }
  }

  async function generateRoundRobinForDivision(divisionId: "A" | "B") {
    const ids = teamsForBracket(grade, divisionId);
    if (ids.length < 2) {
      window.alert(`Need at least 2 teams in ${grade}${divisionId} to generate a round-robin.`);
      return;
    }
    const existing = matchesForDiv(divisionId);
    if (existing.length > 0) {
      if (
        !window.confirm(
          `${grade}${divisionId} already has ${existing.length} match(es). Delete them and generate a fresh round-robin?`
        )
      ) {
        return;
      }
      await deleteQualifyingMatchesByIds(
        tournamentId,
        existing.map((m) => m.id)
      );
    }
    const rows = teamsRowsFor(divisionId);
    const schoolIdByTeamId: Record<string, string> = {};
    for (const t of rows) {
      if (t.schoolId) schoolIdByTeamId[t.id] = t.schoolId;
    }
    const allHaveSchool = ids.every((id) => Boolean(schoolIdByTeamId[id]));
    const anyHaveSchool = ids.some((id) => Boolean(schoolIdByTeamId[id]));
    const distinctSchools = new Set(Object.values(schoolIdByTeamId));
    if (anyHaveSchool && !allHaveSchool && distinctSchools.size >= 2) {
      window.alert(
        "Assign every team in this pool to a school to generate only school-vs-school matches. Generating a full round-robin for now."
      );
    } else if (allHaveSchool && distinctSchools.size > 2) {
      window.alert(
        "More than two schools in this pool; generating a full round-robin (everyone vs everyone)."
      );
    }
    await generateQualifyingRoundRobin(
      tournamentId,
      grade,
      divisionId,
      ids,
      schoolIdByTeamId,
      requestedLeagueCountFor(divisionId)
    );
  }

  async function onRandomizeLeagueSplit(divisionId: "A" | "B") {
    const ids = teamsForBracket(grade, divisionId);
    if (effectiveLeagueCountFor(divisionId) !== 2 || ids.length < 4) {
      window.alert("Need 2-league mode (saved) and at least 4 teams in this pool.");
      return;
    }
    if (matchesForDiv(divisionId).length > 0) {
      if (
        !window.confirm(
          "This pool already has preliminary matches. A new L1/L2 split will not change existing match nodes—clear matches and regenerate the round-robin for consistency. Save the new random split anyway?"
        )
      ) {
        return;
      }
    }
    const { assignment } = shuffleTeamsIntoLeagues(ids);
    await setQualifyingLeagueAssignment(
      tournamentId,
      grade,
      divisionId,
      assignment
    );
  }

  async function onPreviewSeeds() {
    const allMatches = Object.values(qMatches ?? {});
    const seeds = isUnified
      ? computeSeedsForGradeUnified(
          grade,
          teamsForBracket(grade, "A"),
          allMatches,
          fpOpts(teamsForBracket(grade, "A"))
        ).seeds
      : {
          A: computeSeedsForGradeDivision(
            grade,
            "A",
            teamsForBracket(grade, "A"),
            allMatches,
            effectiveLeagueCountFor("A"),
            getQualifyingLeagueAssignment(meta, grade, "A"),
            fpOpts(teamsForBracket(grade, "A"))
          ).seeds,
          B: computeSeedsForGradeDivision(
            grade,
            "B",
            teamsForBracket(grade, "B"),
            allMatches,
            effectiveLeagueCountFor("B"),
            getQualifyingLeagueAssignment(meta, grade, "B"),
            fpOpts(teamsForBracket(grade, "B"))
          ).seeds,
        };
    setSeedPreview(seeds);
  }

  async function onGenerateFinals() {
    if (appendResurrectionToFinals) {
      if (isUnified) {
        if (
          belowCutU.length > 0 &&
          !resMetaU?.completedWinnerTeamId
        ) {
          window.alert(
            "Unified redemption is not finished (no winner yet). Complete it or turn off “Append redemption champion to finals”."
          );
          return;
        }
      } else {
        if (
          belowCutA.length > 0 &&
          !resMetaA?.completedWinnerTeamId
        ) {
          window.alert(
            "Division A redemption is not finished. Complete it or turn off append redemption."
          );
          return;
        }
        if (
          belowCutB.length > 0 &&
          !resMetaB?.completedWinnerTeamId
        ) {
          window.alert(
            "Division B redemption is not finished. Complete it or turn off append redemption."
          );
          return;
        }
      }
    }
    const finalsWithScores = finalsAll.filter(finalMatchHasScores);
    if (finalsWithScores.length > 0) {
      const jcNote = jcChallengeHasProgress
        ? " Japan Cup challenge scores will be kept if the match id is unchanged."
        : "";
      if (
        !window.confirm(
          `${finalsWithScores.length} finals match(es) for ${grade} already have scores. Regenerating replaces the main bracket and may lose in-progress scores.${jcNote} Continue?`
        )
      ) {
        return;
      }
    }
    const allMatches = Object.values(qMatches ?? {});
    const seeds = isUnified
      ? computeSeedsForGradeUnified(
          grade,
          teamsForBracket(grade, "A"),
          allMatches,
          fpOpts(teamsForBracket(grade, "A"))
        ).seeds
      : {
          A: computeSeedsForGradeDivision(
            grade,
            "A",
            teamsForBracket(grade, "A"),
            allMatches,
            effectiveLeagueCountFor("A"),
            getQualifyingLeagueAssignment(meta, grade, "A"),
            fpOpts(teamsForBracket(grade, "A"))
          ).seeds,
          B: computeSeedsForGradeDivision(
            grade,
            "B",
            teamsForBracket(grade, "B"),
            allMatches,
            effectiveLeagueCountFor("B"),
            getQualifyingLeagueAssignment(meta, grade, "B"),
            fpOpts(teamsForBracket(grade, "B"))
          ).seeds,
        };
    const resurrectionWinnerByGroup: Partial<
      Record<ResurrectionPoolGroup, string>
    > = {};
    if (appendResurrectionToFinals) {
      if (isUnified && resMetaU?.completedWinnerTeamId) {
        resurrectionWinnerByGroup.U = resMetaU.completedWinnerTeamId;
      }
      if (!isUnified) {
        if (resMetaA?.completedWinnerTeamId) {
          resurrectionWinnerByGroup.A = resMetaA.completedWinnerTeamId;
        }
        if (resMetaB?.completedWinnerTeamId) {
          resurrectionWinnerByGroup.B = resMetaB.completedWinnerTeamId;
        }
      }
    }
    await generateFinalsForGrade(
      tournamentId,
      grade,
      seeds,
      Object.keys(resurrectionWinnerByGroup).length > 0
        ? { resurrectionWinnerByGroup }
        : undefined
    );
    setSeedPreview(seeds);
  }

  async function onSaveJapanCupChallenge() {
    setJcBusy(true);
    setJcStatus(null);
    try {
      await setJapanCupChallengeEnabled(
        tournamentId,
        grade,
        jcEnabled,
        jcEnabled ? jcChampionName : undefined
      );
      setJcStatus(
        jcEnabled
          ? "Japan Cup challenge saved. Champion is registered separately and excluded from all brackets."
          : "Japan Cup challenge disabled."
      );
    } catch (err) {
      setJcStatus(err instanceof Error ? err.message : "Could not save Japan Cup challenge.");
    } finally {
      setJcBusy(false);
    }
  }

  async function onGenerateResurrectionPool(group: ResurrectionPoolGroup) {
    const entrants =
      group === "U"
        ? belowCutU
        : group === "A"
          ? belowCutA
          : belowCutB;
    if (entrants.length === 0) {
      window.alert("No below-cut teams for this pool.");
      return;
    }
    if (
      finalsAll.length > 0 &&
      !window.confirm(
        "Main finals for this grade already exist. Overwriting redemption can confuse the live view until you regenerate finals. Continue?"
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `Generate redemption knockout for ${entrants.length} team(s)? Existing data for this pool will be replaced.`
      )
    ) {
      return;
    }
    await generateResurrectionBracket(tournamentId, grade, group, entrants);
  }

  async function onClearResurrectionPool(group: ResurrectionPoolGroup) {
    if (!window.confirm("Delete redemption bracket and meta for this pool?")) {
      return;
    }
    await deleteResurrectionGroup(tournamentId, grade, group);
  }

  async function onSaveQualQuick(
    rowId: string,
    values: Record<string, number>
  ): Promise<void> {
    const matchId = rowId.replace(/^q:/, "");
    await completeQualifyingMatch(tournamentId, matchId, {
      round1: { scoreA: values.r1a, scoreB: values.r1b },
      round2: { scoreA: values.r2a, scoreB: values.r2b },
    });
  }

  async function onApplyQualifyingRoundSchedule(
    divisionId: "A" | "B",
    round: number,
    schedule: MatchSchedule | null
  ) {
    const targets = matchesForDiv(divisionId).filter((m) => m.round === round);
    if (targets.length === 0) {
      window.alert(`No matches found for Match ${round}.`);
      return;
    }
    await Promise.all(
      targets.map((m) => updateQualifyingSchedule(tournamentId, m.id, schedule))
    );
  }

  async function onSaveResQuick(
    group: ResurrectionPoolGroup,
    rowId: string,
    values: Record<string, number>
  ): Promise<void> {
    const matchId = rowId.replace(/^res:[A-Z]:/, "");
    const source =
      group === "U"
        ? Object.values(resMatchesU ?? {})
        : group === "A"
          ? Object.values(resMatchesA ?? {})
          : Object.values(resMatchesB ?? {});
    const m = source.find((x) => x.id === matchId);
    if (!m) throw new Error("Match not found.");
    if (!m.regulation) {
      await submitResurrectionRegulation(tournamentId, grade, group, m, {
        scoreA: values.sA,
        scoreB: values.sB,
      });
      return;
    }
    const totals = regulationTotals(m.regulation);
    const needsExtra =
      totals.totalA === totals.totalB && !m.extra8min && !m.suddenDeath;
    if (needsExtra) {
      await submitResurrectionExtraEight(tournamentId, grade, group, m, {
        scoreA: values.sA,
        scoreB: values.sB,
      });
      return;
    }
    throw new Error("Use Cards mode for this match state.");
  }

  async function onSaveFinalsQuick(
    rowId: string,
    values: Record<string, number>
  ): Promise<void> {
    const matchId = rowId.replace(/^f:/, "");
    const m = finalsAll.find((x) => x.id === matchId);
    if (!m) throw new Error("Match not found.");
    if (!m.regulation) {
      await submitFinalRegulation(tournamentId, grade, m, {
        round1: { scoreA: values.r1a, scoreB: values.r1b },
        round2: { scoreA: values.r2a, scoreB: values.r2b },
      });
      return;
    }
    const totals = regulationTotals(m.regulation);
    const needsExtra =
      totals.totalA === totals.totalB && !m.extra8min && !m.suddenDeath;
    if (needsExtra) {
      await submitFinalExtraEight(tournamentId, grade, m, {
        scoreA: values.exA,
        scoreB: values.exB,
      });
      return;
    }
    throw new Error("Use Cards mode for this match state.");
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="font-display text-2xl font-semibold">Admin</h1>
          <p className="text-sm text-cup-muted mt-1">
            Signed in as {user?.email ?? user?.uid}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fairPlayEnabled ? (
            <Link
              to={fairPlayTeacherHref}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-cup-line bg-white px-4 text-sm font-medium text-cup-ink"
            >
              Fair Play (teachers)
            </Link>
          ) : null}
          <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-cup-line bg-white px-3">
            <span className="text-xs text-cup-muted whitespace-nowrap">Live grade</span>
            <select
              id="admin-live-grade"
              className="min-w-[3.25rem] shrink-0 cursor-pointer border-0 bg-transparent py-0 text-sm font-medium text-cup-ink focus:outline-none focus:ring-0"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              aria-label="Live view grade"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <code
            className="hidden lg:inline-block max-w-[min(24rem,40vw)] truncate text-xs text-cup-muted bg-white border border-cup-line rounded-lg px-3 py-2.5"
            title={liveViewDisplayUrl}
          >
            {liveViewDisplayUrl}
          </code>
          <button
            type="button"
            onClick={() => void onCopyLiveViewUrl()}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-cup-line bg-white px-4 text-sm font-medium text-cup-ink"
          >
            {liveUrlCopied ? "Copied!" : "Copy live URL"}
          </button>
          <Link
            to={liveViewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-cup-line bg-cup-paper/60 px-4 text-sm font-medium text-cup-ink"
          >
            Open live view
          </Link>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-cup-ink px-4 text-sm font-medium text-cup-paper"
            onClick={() => signOut(getFirebaseAuth())}
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="sticky top-0 z-30 -mx-1 px-1 py-2 bg-[#f7f5f0]/95 backdrop-blur border-b border-cup-line/80 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
        <a href="#admin-tournament" className="text-cup-ink hover:underline">
          Tournament
        </a>
        <a href="#admin-schools" className="text-cup-ink hover:underline">
          Schools
        </a>
        <a href="#admin-teams" className="text-cup-ink hover:underline">
          Teams
        </a>
        {fairPlayEnabled || SHOW_STUDENTS_SECTION ? (
          <a href="#admin-fair-play" className="text-cup-ink hover:underline">
            Fair Play
          </a>
        ) : null}
        <a href="#admin-preliminary" className="text-cup-ink hover:underline">
          Preliminary
        </a>
        <a href="#admin-redemption" className="text-cup-ink hover:underline">
          Redemption
        </a>
        <a href="#admin-finals" className="text-cup-ink hover:underline">
          Finals
        </a>
      </nav>

      <section
        id="admin-tournament"
        className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4 scroll-mt-20"
      >
        <h2 className="font-display text-lg font-semibold">Tournament</h2>
        <label className="flex flex-col gap-1 text-sm max-w-xs">
          <span className="font-medium">Tournament ID (RTDB path)</span>
          <input
            className="border border-cup-line rounded-md px-3 py-2"
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
          />
        </label>
        {meta ? (
          <div className="space-y-4">
            <p className="text-sm">
              Current: <strong>{meta.name}</strong> (
              {Number.isFinite(Number(meta.schoolYear)) ? meta.schoolYear : "—"})
            </p>
            <form
              onSubmit={onSaveSchoolYear}
              className="flex flex-wrap gap-3 items-end border-t border-cup-line pt-4"
            >
              <label className="flex flex-col gap-1 text-sm">
                <span>School year</span>
                <input
                  type="number"
                  className="border border-cup-line rounded-md px-3 py-2 w-28"
                  value={metaSchoolYear}
                  onChange={(e) => setMetaSchoolYear(Number(e.target.value))}
                  min={1900}
                  max={2100}
                />
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white"
              >
                Save school year
              </button>
            </form>
            <p className="text-sm border border-cup-line rounded-lg px-3 py-2 bg-cup-paper/40 max-w-xl">
              <span className="text-cup-muted">Tournament kind:</span>{" "}
              <strong>
                {meta.tournamentKind === "interSchool"
                  ? "School vs other school"
                  : "Within-school"}
              </strong>
              {meta.tournamentKind == null ? (
                <span className="text-cup-muted text-xs font-normal">
                  {" "}
                  (legacy meta — assumed within-school)
                </span>
              ) : null}
            </p>
            {isInterSchoolTournament ? (
              <div className="border-t border-cup-line pt-4 text-sm text-cup-muted max-w-xl space-y-1">
                <p>
                  <strong className="text-cup-ink">School vs other school</strong> uses a{" "}
                  <strong>unified</strong> preliminary league (Pool A only) and rank-based
                  finals seeds. Plan roughly <strong>1 hour preliminary + 1 hour finals</strong>;
                  register two schools, assign every team, then generate cross-school fixtures
                  when possible.
                </p>
                <p className="text-xs">
                  Preliminary layout is fixed for this kind. To switch, delete tournament meta or
                  use another tournament ID.
                </p>
              </div>
            ) : (
            <form
              onSubmit={onSaveQualifyingMode}
              className="flex flex-wrap gap-3 items-end border-t border-cup-line pt-4"
            >
              <p className="text-xs text-cup-muted w-full">
                <strong>Two pools</strong>: G1A and G1B each play their own round-robin, then
                finalists alternate A1, B1, A2, B2… <strong>Unified</strong>: one combined
                league—add all teams under Pool A only; top finishers by rank advance to
                finals (best-first seeding).
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span>Preliminary layout</span>
                <select
                  className="border border-cup-line rounded-md px-3 py-2 bg-white"
                  value={metaQualifyingMode}
                  onChange={(e) =>
                    setMetaQualifyingMode(
                      e.target.value === "unified" ? "unified" : "twoPools"
                    )
                  }
                >
                  <option value="twoPools">Two pools (A + B)</option>
                  <option value="unified">Unified (single league in Pool A)</option>
                </select>
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cup-ink text-cup-paper text-sm font-medium"
              >
                Save preliminary layout
              </button>
            </form>
            )}
            <form
              onSubmit={onSaveDivisionLabels}
              className="flex flex-wrap gap-3 items-end border-t border-cup-line pt-4"
            >
              <p className="text-xs text-cup-muted w-full">
                Optional labels for preliminary pools A and B (e.g. two schools). These
                replace &quot;Division A/B&quot; in the UI.
                {isUnified ? (
                  <span className="block mt-1">
                    In unified mode, only Pool A is used; the Pool B label is ignored.
                  </span>
                ) : null}
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span>Pool A label</span>
                <input
                  className="border border-cup-line rounded-md px-3 py-2 min-w-[180px]"
                  value={metaLabelA}
                  onChange={(e) => setMetaLabelA(e.target.value)}
                  placeholder="e.g. Felice Elementary"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Pool B label</span>
                <input
                  className="border border-cup-line rounded-md px-3 py-2 min-w-[180px]"
                  value={metaLabelB}
                  onChange={(e) => setMetaLabelB(e.target.value)}
                  placeholder="e.g. Partner junior high"
                />
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white"
              >
                Save pool labels
              </button>
            </form>
            <div className="border-t border-cup-line pt-4">
              <button
                type="button"
                onClick={() => void onDeleteTournamentMeta()}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-800 text-sm font-medium bg-white hover:bg-red-50"
              >
                Delete tournament meta
              </button>
              <p className="text-xs text-cup-muted mt-2 max-w-xl">
                Removes name, year, and settings only. Teams and match data under this
                tournament ID stay in the database until you delete them separately.
              </p>
            </div>
          </div>
        ) : (
          <form
            onSubmit={onCreateTournament}
            className="space-y-4 border-t border-cup-line pt-4"
          >
            <fieldset className="space-y-2 max-w-xl">
              <legend className="text-sm font-medium">Tournament kind</legend>
              <p className="text-xs text-cup-muted">
                Choose before creating meta — this cannot be changed later except by deleting
                meta or using a new tournament ID.
              </p>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="tournamentKind"
                  className="mt-1"
                  checked={newTournamentKind === "intraSchool"}
                  onChange={() => setNewTournamentKind("intraSchool")}
                />
                <span>
                  <strong>Within-school</strong> — normal two-pool or unified preliminary; use
                  for events at one school.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="tournamentKind"
                  className="mt-1"
                  checked={newTournamentKind === "interSchool"}
                  onChange={() => setNewTournamentKind("interSchool")}
                />
                <span>
                  <strong>School vs other school</strong> — special flow: unified league (Pool
                  A), cross-school fixtures when teams have two schools assigned, rank-based
                  finals. Budget time (e.g. ~1h preliminary + ~1h finals).
                </span>
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1 text-sm">
                <span>Name</span>
                <input
                  className="border border-cup-line rounded-md px-3 py-2 min-w-[220px]"
                  value={newTournamentName}
                  onChange={(e) => setNewTournamentName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>School year</span>
                <input
                  type="number"
                  className="border border-cup-line rounded-md px-3 py-2 w-28"
                  value={newSchoolYear}
                  onChange={(e) => setNewSchoolYear(Number(e.target.value))}
                />
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cup-accent text-white text-sm font-medium"
              >
                Create meta
              </button>
            </div>
          </form>
        )}
      </section>

      <section
        id="admin-schools"
        className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4 scroll-mt-20"
      >
        <h2 className="font-display text-lg font-semibold">Schools</h2>
        <p className="text-xs text-cup-muted">
          Optional registry for multi-school events. Assign teams to a school when adding
          them (or change below). Pool labels (above) name each round-robin group; schools
          tag which organization each team belongs to.
        </p>
        <form onSubmit={onAddSchool} className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span>School name</span>
            <input
              className="border border-cup-line rounded-md px-3 py-2 min-w-[200px]"
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              placeholder="Full name"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Short label (optional)</span>
            <input
              className="border border-cup-line rounded-md px-3 py-2 w-36"
              value={newSchoolShort}
              onChange={(e) => setNewSchoolShort(e.target.value)}
              placeholder="Abbrev."
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-cup-ink text-cup-paper text-sm font-medium"
          >
            Add school
          </button>
        </form>
        {schools && Object.keys(schools).length > 0 ? (
          <ul className="text-sm border border-cup-line rounded-lg divide-y divide-cup-line bg-white max-w-xl">
            {Object.entries(schools).map(([id, s]) => (
              <li
                key={id}
                className="px-3 py-2 flex justify-between gap-2 items-center"
              >
                <span>
                  <span className="font-mono text-xs text-cup-muted">{id}</span>{" "}
                  <strong>{s.name}</strong>
                  {s.shortLabel ? (
                    <span className="text-cup-muted"> · {s.shortLabel}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-red-700 hover:underline"
                  onClick={() =>
                    void onDeleteSchoolRow(id, s.shortLabel || s.name)
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cup-muted">No schools yet (optional).</p>
        )}
      </section>

      <section
        id="admin-teams"
        className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4 scroll-mt-20"
      >
        <h2 className="font-display text-lg font-semibold">Teams</h2>
        <p className="text-xs text-cup-muted">
          Teams are listed per division for <strong>{grade}</strong> (change grade in the header).
          Same grade drives Preliminary, Redemption, and Finals below.
        </p>
        {isUnified ? (
          <p className="text-sm text-cup-ink bg-cup-paper/80 border border-cup-line rounded-lg px-3 py-2">
            <strong>Unified mode:</strong> add every team to Pool A only. Pool B is hidden.
            Generate the round-robin for Pool A to run one league before finals.
          </p>
        ) : null}
        <div
          className={
            isUnified ? "grid gap-6" : "grid md:grid-cols-2 gap-6"
          }
        >
          <div className="rounded-lg border border-cup-line bg-cup-paper/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-cup-ink border-b border-cup-line pb-2">
              {grade} · {divisionLabel(meta, "A")}
            </h3>
            {mixedSchoolsInPool.A ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                This pool has teams linked to more than one school. For a clean host vs
                partner setup, use one school per pool.
              </p>
            ) : null}
            <form
              onSubmit={(e) => void onAddTeamDivision(e, "A", teamNameA, teamCodeA)}
              className="flex flex-col gap-2"
            >
              <label className="flex flex-col gap-1 text-sm">
                <span>Team name</span>
                <input
                  className="border border-cup-line rounded-md px-3 py-2 bg-white"
                  value={teamNameA}
                  onChange={(e) => setTeamNameA(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Code (roster id, e.g. FCA001)</span>
                <input
                  className="border border-cup-line rounded-md px-3 py-2 bg-white w-full max-w-[8rem]"
                  value={teamCodeA}
                  onChange={(e) => setTeamCodeA(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>School (optional)</span>
                <select
                  className="border border-cup-line rounded-md px-3 py-2 bg-white max-w-full"
                  value={teamSchoolIdA}
                  onChange={(e) => setTeamSchoolIdA(e.target.value)}
                >
                  <option value="">—</option>
                  {Object.entries(schools ?? {}).map(([id, s]) => (
                    <option key={id} value={id}>
                      {s.shortLabel || s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="self-start px-4 py-2 rounded-lg bg-cup-ink text-cup-paper text-sm font-medium"
              >
                Add team
              </button>
            </form>
            <ul className="text-sm max-h-56 overflow-y-auto border border-cup-line rounded-lg divide-y divide-cup-line bg-white">
              {teamsRowsFor("A").length === 0 ? (
                <li className="px-3 py-2 text-cup-muted">
                  No teams in {grade} ({divisionLabel(meta, "A")}).
                </li>
              ) : (
                teamsRowsFor("A").map((t) => (
                  <li
                    key={t.id}
                    className="px-3 py-2 flex flex-wrap justify-between gap-2 items-center"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-cup-muted">{t.id}</span>{" "}
                      <strong>{nameById.get(t.id) ?? t.name}</strong>
                      {t.code ? <span className="text-cup-muted"> · {t.code}</span> : null}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="text-xs border border-cup-line rounded px-2 py-1 max-w-[10rem] bg-white"
                        value={t.schoolId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          void updateTeamSchool(
                            tournamentId,
                            t.id,
                            v === "" ? null : v
                          );
                        }}
                      >
                        <option value="">School…</option>
                        {Object.entries(schools ?? {}).map(([id, s]) => (
                          <option key={id} value={id}>
                            {s.shortLabel || s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-xs text-cup-accent hover:underline"
                        onClick={() => void copyTeamViewerLink(t.id)}
                      >
                        {copiedTeamId === t.id ? "Copied!" : "Copy team link"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-700 hover:underline"
                        onClick={() => void onDeleteTeam(t.id, t.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
          {!isUnified ? (
          <div className="rounded-lg border border-cup-line bg-cup-paper/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-cup-ink border-b border-cup-line pb-2">
              {grade} · {divisionLabel(meta, "B")}
            </h3>
            {mixedSchoolsInPool.B ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                This pool has teams linked to more than one school. For a clean host vs
                partner setup, use one school per pool.
              </p>
            ) : null}
            <form
              onSubmit={(e) => void onAddTeamDivision(e, "B", teamNameB, teamCodeB)}
              className="flex flex-col gap-2"
            >
              <label className="flex flex-col gap-1 text-sm">
                <span>Team name</span>
                <input
                  className="border border-cup-line rounded-md px-3 py-2 bg-white"
                  value={teamNameB}
                  onChange={(e) => setTeamNameB(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Code (roster id, e.g. FCA001)</span>
                <input
                  className="border border-cup-line rounded-md px-3 py-2 bg-white w-full max-w-[8rem]"
                  value={teamCodeB}
                  onChange={(e) => setTeamCodeB(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>School (optional)</span>
                <select
                  className="border border-cup-line rounded-md px-3 py-2 bg-white max-w-full"
                  value={teamSchoolIdB}
                  onChange={(e) => setTeamSchoolIdB(e.target.value)}
                >
                  <option value="">—</option>
                  {Object.entries(schools ?? {}).map(([id, s]) => (
                    <option key={id} value={id}>
                      {s.shortLabel || s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="self-start px-4 py-2 rounded-lg bg-cup-ink text-cup-paper text-sm font-medium"
              >
                Add team
              </button>
            </form>
            <ul className="text-sm max-h-56 overflow-y-auto border border-cup-line rounded-lg divide-y divide-cup-line bg-white">
              {teamsRowsFor("B").length === 0 ? (
                <li className="px-3 py-2 text-cup-muted">
                  No teams in {grade} ({divisionLabel(meta, "B")}).
                </li>
              ) : (
                teamsRowsFor("B").map((t) => (
                  <li
                    key={t.id}
                    className="px-3 py-2 flex flex-wrap justify-between gap-2 items-center"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-cup-muted">{t.id}</span>{" "}
                      <strong>{nameById.get(t.id) ?? t.name}</strong>
                      {t.code ? <span className="text-cup-muted"> · {t.code}</span> : null}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="text-xs border border-cup-line rounded px-2 py-1 max-w-[10rem] bg-white"
                        value={t.schoolId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          void updateTeamSchool(
                            tournamentId,
                            t.id,
                            v === "" ? null : v
                          );
                        }}
                      >
                        <option value="">School…</option>
                        {Object.entries(schools ?? {}).map(([id, s]) => (
                          <option key={id} value={id}>
                            {s.shortLabel || s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-xs text-cup-accent hover:underline"
                        onClick={() => void copyTeamViewerLink(t.id)}
                      >
                        {copiedTeamId === t.id ? "Copied!" : "Copy team link"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-700 hover:underline"
                        onClick={() => void onDeleteTeam(t.id, t.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
          ) : null}
        </div>
      </section>

      {fairPlayEnabled || SHOW_STUDENTS_SECTION ? (
        <div id="admin-fair-play" className="space-y-10 scroll-mt-20">
          {fairPlayEnabled || SHOW_STUDENTS_SECTION ? (
            <AdminStudentsSection
          tournamentId={tournamentId}
          gradeId={grade}
          teams={teams}
          students={students}
          fairPlayEnabled={fairPlayEnabled}
        />
          ) : null}

          {fairPlayEnabled ? (
            <FairPlayAdminSection
          tournamentId={tournamentId}
          meta={meta as TournamentMeta | null}
          teams={teams}
          students={students}
          incidents={fairPlayIncidents}
          workingGrade={grade}
          finalsGradeMeta={finalsGradeMeta}
          schools={schools}
        />
          ) : null}
        </div>
      ) : null}

      <section
        id="admin-preliminary"
        className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4 scroll-mt-20"
      >
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <h2 className="font-display text-lg font-semibold">Preliminary</h2>
          <MatchSectionToolbar
            viewMode={qualViewMode}
            onViewModeChange={setQualViewMode}
            filter={qualFilter}
            onFilterChange={setQualFilter}
          />
        </div>
        {isUnified ? (
          <p className="text-xs text-cup-muted">
            Unified layout: standings and fixtures for Pool B are hidden. Use Pool A only.
          </p>
        ) : null}

        <div
          className={
            isUnified ? "grid gap-6" : "grid md:grid-cols-2 gap-6"
          }
        >
          <div>
            <h3 className="text-sm font-semibold text-cup-muted mb-2">
              Standings {grade} · {divisionLabel(meta, "A")}
            </h3>
            {effectiveLeagueCountFor("A") === 2 ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-cup-muted mb-1">League 1</h4>
                  <StandingsTable standings={standA_L1} nameById={nameById} showFairPlay={fairPlayEnabled} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-cup-muted mb-1">League 2</h4>
                  <StandingsTable standings={standA_L2} nameById={nameById} showFairPlay={fairPlayEnabled} />
                </div>
              </div>
            ) : (
              <StandingsTable standings={standA} nameById={nameById} showFairPlay={fairPlayEnabled} />
            )}
          </div>
          {!isUnified ? (
          <div>
            <h3 className="text-sm font-semibold text-cup-muted mb-2">
              Standings {grade} · {divisionLabel(meta, "B")}
            </h3>
            {effectiveLeagueCountFor("B") === 2 ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-cup-muted mb-1">League 1</h4>
                  <StandingsTable standings={standB_L1} nameById={nameById} showFairPlay={fairPlayEnabled} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-cup-muted mb-1">League 2</h4>
                  <StandingsTable standings={standB_L2} nameById={nameById} showFairPlay={fairPlayEnabled} />
                </div>
              </div>
            ) : (
              <StandingsTable standings={standB} nameById={nameById} showFairPlay={fairPlayEnabled} />
            )}
          </div>
          ) : null}
        </div>

        <div
          className={
            isUnified ? "grid gap-6" : "grid md:grid-cols-2 gap-6"
          }
        >
          <div className="rounded-lg border border-cup-line bg-cup-paper/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold border-b border-cup-line pb-2">
              Round-robin — {grade} · {divisionLabel(meta, "A")}
            </h3>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs text-cup-muted flex flex-col gap-1">
                <span>League count</span>
                <select
                  value={leagueCountA}
                  onChange={(e) => setLeagueCountA(e.target.value === "2" ? 2 : 1)}
                  className="border border-cup-line rounded px-2 py-1 bg-white text-xs"
                >
                  <option value={1}>1 league</option>
                  <option value={2}>2 leagues</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void onSaveDivisionLeagueCount("A")}
                className="px-3 py-1.5 rounded-lg border border-cup-line text-xs font-medium bg-white"
              >
                Save league setup
              </button>
              {effectiveLeagueCountFor("A") === 2 ? (
                <span className="text-xs text-cup-muted">
                  Split view active (League 1 + League 2)
                </span>
              ) : null}
            </div>
            {effectiveLeagueCountFor("A") === 2 &&
            teamsForBracket(grade, "A").length >= 4 ? (
              <div className="text-xs space-y-2 border border-cup-line rounded-lg p-3 bg-white">
                <p className="text-cup-muted font-medium">Saved L1 / L2 split</p>
                <p>
                  <span className="text-cup-muted">League 1:</span>{" "}
                  {leagueTeamsFor("A").L1.length
                    ? leagueTeamsFor("A").L1
                        .map((id) => nameById.get(id) ?? id)
                        .join(", ")
                    : "—"}
                </p>
                <p>
                  <span className="text-cup-muted">League 2:</span>{" "}
                  {leagueTeamsFor("A").L2.length
                    ? leagueTeamsFor("A").L2
                        .map((id) => nameById.get(id) ?? id)
                        .join(", ")
                    : "—"}
                </p>
                <button
                  type="button"
                  onClick={() => void onRandomizeLeagueSplit("A")}
                  className="px-3 py-1.5 rounded-lg border border-cup-line text-xs font-medium bg-cup-paper hover:bg-cup-paper/80"
                >
                  Randomize &amp; save split
                </button>
                <p className="text-cup-muted">
                  First round-robin generate also picks a random split and saves it. Regenerate
                  fixtures after changing the split.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void generateRoundRobinForDivision("A")}
                className="px-3 py-2 rounded-lg bg-cup-accent text-white text-sm font-medium"
              >
                Generate round-robin
              </button>
              <button
                type="button"
                onClick={() => void onClearRoundRobin("A")}
                className="px-3 py-2 rounded-lg border border-red-300 text-red-800 text-sm font-medium bg-white hover:bg-red-50"
              >
                Clear all matches
              </button>
            </div>
            <RoundGroupScheduleForm
              rounds={[...new Set(matchesForDiv("A").map((m) => m.round))].sort(
                (a, b) => a - b
              )}
              onApply={(round, s) =>
                onApplyQualifyingRoundSchedule("A", round, s)
              }
            />
            {qualViewMode === "quick" ? (
              <MatchScoreGrid
                title={`${grade} · ${divisionLabel(meta, "A")} quick scores`}
                rows={qualRowsForDiv("A")}
                onSaveRow={onSaveQualQuick}
              />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {renderQualifyingEditorsByRound("A")}
              </div>
            )}
          </div>
          {!isUnified ? (
          <div className="rounded-lg border border-cup-line bg-cup-paper/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold border-b border-cup-line pb-2">
              Round-robin — {grade} · {divisionLabel(meta, "B")}
            </h3>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs text-cup-muted flex flex-col gap-1">
                <span>League count</span>
                <select
                  value={leagueCountB}
                  onChange={(e) => setLeagueCountB(e.target.value === "2" ? 2 : 1)}
                  className="border border-cup-line rounded px-2 py-1 bg-white text-xs"
                >
                  <option value={1}>1 league</option>
                  <option value={2}>2 leagues</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void onSaveDivisionLeagueCount("B")}
                className="px-3 py-1.5 rounded-lg border border-cup-line text-xs font-medium bg-white"
              >
                Save league setup
              </button>
              {effectiveLeagueCountFor("B") === 2 ? (
                <span className="text-xs text-cup-muted">
                  Split view active (League 1 + League 2)
                </span>
              ) : null}
            </div>
            {effectiveLeagueCountFor("B") === 2 &&
            teamsForBracket(grade, "B").length >= 4 ? (
              <div className="text-xs space-y-2 border border-cup-line rounded-lg p-3 bg-white">
                <p className="text-cup-muted font-medium">Saved L1 / L2 split</p>
                <p>
                  <span className="text-cup-muted">League 1:</span>{" "}
                  {leagueTeamsFor("B").L1.length
                    ? leagueTeamsFor("B").L1
                        .map((id) => nameById.get(id) ?? id)
                        .join(", ")
                    : "—"}
                </p>
                <p>
                  <span className="text-cup-muted">League 2:</span>{" "}
                  {leagueTeamsFor("B").L2.length
                    ? leagueTeamsFor("B").L2
                        .map((id) => nameById.get(id) ?? id)
                        .join(", ")
                    : "—"}
                </p>
                <button
                  type="button"
                  onClick={() => void onRandomizeLeagueSplit("B")}
                  className="px-3 py-1.5 rounded-lg border border-cup-line text-xs font-medium bg-cup-paper hover:bg-cup-paper/80"
                >
                  Randomize &amp; save split
                </button>
                <p className="text-cup-muted">
                  First round-robin generate also picks a random split and saves it. Regenerate
                  fixtures after changing the split.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void generateRoundRobinForDivision("B")}
                className="px-3 py-2 rounded-lg bg-cup-accent text-white text-sm font-medium"
              >
                Generate round-robin
              </button>
              <button
                type="button"
                onClick={() => void onClearRoundRobin("B")}
                className="px-3 py-2 rounded-lg border border-red-300 text-red-800 text-sm font-medium bg-white hover:bg-red-50"
              >
                Clear all matches
              </button>
            </div>
            <RoundGroupScheduleForm
              rounds={[...new Set(matchesForDiv("B").map((m) => m.round))].sort(
                (a, b) => a - b
              )}
              onApply={(round, s) =>
                onApplyQualifyingRoundSchedule("B", round, s)
              }
            />
            {qualViewMode === "quick" ? (
              <MatchScoreGrid
                title={`${grade} · ${divisionLabel(meta, "B")} quick scores`}
                rows={qualRowsForDiv("B")}
                onSaveRow={onSaveQualQuick}
              />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {renderQualifyingEditorsByRound("B")}
              </div>
            )}
          </div>
          ) : null}
        </div>
      </section>

      <section
        id="admin-redemption"
        className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4 scroll-mt-20"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Redemption</h2>
          <MatchSectionToolbar
            viewMode={resViewMode}
            onViewModeChange={setResViewMode}
            filter={resFilter}
            onFilterChange={setResFilter}
          />
        </div>
        <p className="text-xs text-cup-muted max-w-3xl">
          Below-cut teams (same K as direct finals qualifiers) play a single-elimination bracket:
          3 min regulation (one score pair), one extra round if tied, then sudden death. The winner
          can be appended as an extra finals seed when you generate the main bracket.
        </p>
        {isUnified ? (
          <div className="rounded-lg border border-cup-line bg-cup-paper/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Unified · Pool A</h3>
            <p className="text-xs text-cup-muted">
              Below cut ({belowCutU.length}):{" "}
              {belowCutU.length
                ? belowCutU.map((id) => nameById.get(id) ?? id).join(", ")
                : "—"}
            </p>
            {resMetaU?.completedWinnerTeamId ? (
              <p className="text-sm font-medium text-cup-win">
                Winner:{" "}
                {nameById.get(resMetaU.completedWinnerTeamId) ??
                  resMetaU.completedWinnerTeamId}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onGenerateResurrectionPool("U")}
                className="px-3 py-2 rounded-lg bg-cup-accent text-white text-sm font-medium"
              >
                Generate / overwrite bracket
              </button>
              <button
                type="button"
                onClick={() => void onClearResurrectionPool("U")}
                className="px-3 py-2 rounded-lg border border-red-300 text-red-800 text-sm font-medium bg-white"
              >
                Clear redemption
              </button>
            </div>
            {resViewMode === "quick" ? (
              <MatchScoreGrid
                title={`${grade} · Unified quick scores`}
                rows={resRowsForGroup(
                  "U",
                  Object.values(resMatchesU ?? {})
                )}
                onSaveRow={(rowId, values) => onSaveResQuick("U", rowId, values)}
              />
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {Object.values(resMatchesU ?? {})
                  .sort(compareFinalByRoundThenScheduleThenSlot)
                  .map((m, idx) => (
                    <ResurrectionMatchEditor
                      key={`resU-${m.id}-${idx}`}
                      m={m}
                      tournamentId={tournamentId}
                      grade={grade}
                      group="U"
                      nameById={nameById}
                    />
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-cup-line bg-cup-paper/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {grade} · {divisionLabel(meta, "A")}
              </h3>
              <p className="text-xs text-cup-muted">
                Below cut ({belowCutA.length}):{" "}
                {belowCutA.length
                  ? belowCutA.map((id) => nameById.get(id) ?? id).join(", ")
                  : "—"}
              </p>
              {resMetaA?.completedWinnerTeamId ? (
                <p className="text-sm font-medium text-cup-win">
                  Winner:{" "}
                  {nameById.get(resMetaA.completedWinnerTeamId) ??
                    resMetaA.completedWinnerTeamId}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onGenerateResurrectionPool("A")}
                  className="px-3 py-2 rounded-lg bg-cup-accent text-white text-sm font-medium"
                >
                  Generate / overwrite
                </button>
                <button
                  type="button"
                  onClick={() => void onClearResurrectionPool("A")}
                  className="px-3 py-2 rounded-lg border border-red-300 text-red-800 text-sm"
                >
                  Clear
                </button>
              </div>
              {resViewMode === "quick" ? (
                <MatchScoreGrid
                  title={`${grade} · ${divisionLabel(meta, "A")} quick scores`}
                  rows={resRowsForGroup(
                    "A",
                    Object.values(resMatchesA ?? {})
                  )}
                  onSaveRow={(rowId, values) => onSaveResQuick("A", rowId, values)}
                />
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {Object.values(resMatchesA ?? {})
                    .sort(compareFinalByRoundThenScheduleThenSlot)
                    .map((m, idx) => (
                      <ResurrectionMatchEditor
                        key={`resA-${m.id}-${idx}`}
                        m={m}
                        tournamentId={tournamentId}
                        grade={grade}
                        group="A"
                        nameById={nameById}
                      />
                    ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-cup-line bg-cup-paper/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {grade} · {divisionLabel(meta, "B")}
              </h3>
              <p className="text-xs text-cup-muted">
                Below cut ({belowCutB.length}):{" "}
                {belowCutB.length
                  ? belowCutB.map((id) => nameById.get(id) ?? id).join(", ")
                  : "—"}
              </p>
              {resMetaB?.completedWinnerTeamId ? (
                <p className="text-sm font-medium text-cup-win">
                  Winner:{" "}
                  {nameById.get(resMetaB.completedWinnerTeamId) ??
                    resMetaB.completedWinnerTeamId}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onGenerateResurrectionPool("B")}
                  className="px-3 py-2 rounded-lg bg-cup-accent text-white text-sm font-medium"
                >
                  Generate / overwrite
                </button>
                <button
                  type="button"
                  onClick={() => void onClearResurrectionPool("B")}
                  className="px-3 py-2 rounded-lg border border-red-300 text-red-800 text-sm"
                >
                  Clear
                </button>
              </div>
              {resViewMode === "quick" ? (
                <MatchScoreGrid
                  title={`${grade} · ${divisionLabel(meta, "B")} quick scores`}
                  rows={resRowsForGroup(
                    "B",
                    Object.values(resMatchesB ?? {})
                  )}
                  onSaveRow={(rowId, values) => onSaveResQuick("B", rowId, values)}
                />
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {Object.values(resMatchesB ?? {})
                    .sort(compareFinalByRoundThenScheduleThenSlot)
                    .map((m, idx) => (
                      <ResurrectionMatchEditor
                        key={`resB-${m.id}-${idx}`}
                        m={m}
                        tournamentId={tournamentId}
                        grade={grade}
                        group="B"
                        nameById={nameById}
                      />
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section
        id="admin-finals"
        className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4 scroll-mt-20"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Finals</h2>
          <MatchSectionToolbar
            viewMode={finalsViewMode}
            onViewModeChange={setFinalsViewMode}
            filter={finalsFilter}
            onFilterChange={setFinalsFilter}
          />
        </div>
        <JapanCupConfigPanel
          grade={grade}
          jcEnabled={jcEnabled}
          onJcEnabledChange={setJcEnabled}
          jcChampionName={jcChampionName}
          onJcChampionNameChange={setJcChampionName}
          jcBusy={jcBusy}
          jcStatus={jcStatus}
          onSave={() => void onSaveJapanCupChallenge()}
          showExistingBracketWarning={jcExistingDataWarning}
          showChallengeProgressWarning={jcChallengeHasProgress}
        />
        <label className="flex items-start gap-2 text-sm cursor-pointer max-w-xl">
          <input
            type="checkbox"
            className="mt-1"
            checked={appendResurrectionToFinals}
            onChange={(e) => setAppendResurrectionToFinals(e.target.checked)}
          />
          <span>
            Append redemption champion(s) to main finals seeds when generating (K+1 per pool
            where a champion exists). Requires finished redemption for any pool that still has
            below-cut teams.
          </span>
        </label>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            onClick={() => void onPreviewSeeds()}
            className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium"
          >
            Preview seeds
          </button>
          <button
            type="button"
            onClick={() => void onGenerateFinals()}
            className="px-4 py-2 rounded-lg bg-cup-ink text-cup-paper text-sm font-medium"
          >
            Generate / overwrite bracket
          </button>
          <button
            type="button"
            onClick={() => void onClearFinalsBracket()}
            className="px-4 py-2 rounded-lg border border-red-300 text-red-800 text-sm font-medium bg-white hover:bg-red-50"
          >
            Delete finals bracket
          </button>
        </div>
        {seedPreview && (
          <pre className="text-xs bg-cup-paper border border-cup-line rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(seedPreview, null, 2)}
          </pre>
        )}
        <div className="space-y-4">
          {isUnified ? (
            <>
              {finalsViewMode === "quick" ? (
                <MatchScoreGrid
                  title={`${grade} · Unified finals quick scores`}
                  rows={finalsRows(finalsUnified)}
                  onSaveRow={onSaveFinalsQuick}
                />
              ) : (
                finalsUnified
                  .sort(compareFinalByRoundThenScheduleThenSlot)
                  .map((m, idx) => (
                    <FinalMatchEditor
                      key={`U-${m.id}-${m.roundIndex}-${m.slotInRound}-${idx}`}
                      m={m}
                      tournamentId={tournamentId}
                      grade={grade}
                      nameById={nameById}
                    />
                  ))
              )}
              <JapanCupChallengeScoring
                grade={grade}
                matches={finalsJapanCupChallenge}
                gradeFinalComplete={gradeFinalComplete}
                viewMode={finalsViewMode}
                finalsRows={finalsRows}
                onSaveRow={onSaveFinalsQuick}
                tournamentId={tournamentId}
                nameById={nameById}
                FinalMatchEditor={FinalMatchEditor}
              />
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-cup-muted">
                    {grade} · {divisionLabel(meta, "A")} finals
                  </h3>
                  {finalsViewMode === "quick" ? (
                    <MatchScoreGrid
                      title={`${grade} · ${divisionLabel(meta, "A")} finals quick scores`}
                      rows={finalsRows(finalsA)}
                      onSaveRow={onSaveFinalsQuick}
                    />
                  ) : (
                    finalsA
                      .sort(compareFinalByRoundThenScheduleThenSlot)
                      .map((m, idx) => (
                        <FinalMatchEditor
                          key={`A-${m.id}-${m.roundIndex}-${m.slotInRound}-${idx}`}
                          m={m}
                          tournamentId={tournamentId}
                          grade={grade}
                          nameById={nameById}
                        />
                      ))
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-cup-muted">
                    {grade} · {divisionLabel(meta, "B")} finals
                  </h3>
                  {finalsViewMode === "quick" ? (
                    <MatchScoreGrid
                      title={`${grade} · ${divisionLabel(meta, "B")} finals quick scores`}
                      rows={finalsRows(finalsB)}
                      onSaveRow={onSaveFinalsQuick}
                    />
                  ) : (
                    finalsB
                      .sort(compareFinalByRoundThenScheduleThenSlot)
                      .map((m, idx) => (
                        <FinalMatchEditor
                          key={`B-${m.id}-${m.roundIndex}-${m.slotInRound}-${idx}`}
                          m={m}
                          tournamentId={tournamentId}
                          grade={grade}
                          nameById={nameById}
                        />
                      ))
                  )}
                </div>
              </div>
              {finalsUnified.length > 0 ? (
                <div className="space-y-3 border-t border-cup-line pt-4">
                  <h3 className="text-sm font-semibold text-cup-muted">
                    {grade} · Grade championship final
                  </h3>
                  {finalsViewMode === "quick" ? (
                    <MatchScoreGrid
                      title={`${grade} · Grade championship quick scores`}
                      rows={finalsRows(finalsUnified)}
                      onSaveRow={onSaveFinalsQuick}
                    />
                  ) : (
                    finalsUnified
                      .sort(compareFinalByRoundThenScheduleThenSlot)
                      .map((m, idx) => (
                        <FinalMatchEditor
                          key={`GF-${m.id}-${m.roundIndex}-${m.slotInRound}-${idx}`}
                          m={m}
                          tournamentId={tournamentId}
                          grade={grade}
                          nameById={nameById}
                        />
                      ))
                  )}
                </div>
              ) : null}
              <JapanCupChallengeScoring
                grade={grade}
                matches={finalsJapanCupChallenge}
                gradeFinalComplete={gradeFinalComplete}
                viewMode={finalsViewMode}
                finalsRows={finalsRows}
                onSaveRow={onSaveFinalsQuick}
                tournamentId={tournamentId}
                nameById={nameById}
                FinalMatchEditor={FinalMatchEditor}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AdminStudentsSection({
  tournamentId,
  gradeId,
  teams,
  students,
  fairPlayEnabled,
}: {
  tournamentId: string;
  gradeId: string;
  teams: Record<string, TeamRecord> | null;
  students: Record<string, StudentRecord> | null;
  fairPlayEnabled: boolean;
}) {
  const [studentName, setStudentName] = useState("");
  const [studentTeamCode, setStudentTeamCode] = useState("");
  const [studentId, setStudentId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [bulkPaste, setBulkPaste] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [bulkFailed, setBulkFailed] = useState(false);
  const [showAllGrades, setShowAllGrades] = useState(false);
  const teamCodes = useMemo(() => listTeamCodes(teams, gradeId), [teams, gradeId]);
  const duplicateCodes = useMemo(() => findDuplicateTeamCodes(teams), [teams]);
  const studentsInGrade = useMemo(
    () => filterStudentsByGrade(students, teams, gradeId),
    [students, teams, gradeId]
  );
  const totalStudentCount = students ? Object.keys(students).length : 0;
  const studentsOutsideGrade = totalStudentCount - studentsInGrade.length;
  const rosterRows = useMemo(
    () => (showAllGrades ? listAllStudents(students, teams) : studentsInGrade),
    [showAllGrades, students, teams, studentsInGrade]
  );
  const existingIdHint = useMemo(() => {
    const id = studentId.trim();
    if (!id || !students?.[id]) return null;
    return describeExistingStudent(id, students[id], teams);
  }, [studentId, students, teams]);

  async function onAddStudent(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!studentId.trim() || !studentName.trim()) return;
    const key = studentId.trim();
    const existing = students?.[key];
    if (existing) {
      const label = describeExistingStudent(key, existing, teams);
      if (
        !window.confirm(
          `Student ID "${key}" already exists (${label}). Saving will overwrite that record. Continue?`
        )
      ) {
        return;
      }
    }
    try {
      await addStudent(
        tournamentId,
        studentId.trim(),
        {
          name: studentName.trim(),
          ...(studentTeamCode.trim() ? { teamId: studentTeamCode.trim() } : {}),
        },
        teams,
        { gradeId }
      );
      setStudentName("");
      setStudentId("");
      setStudentTeamCode("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save student.");
    }
  }

  async function onBulkUpload(e: FormEvent) {
    e.preventDefault();
    setBulkResult(null);
    setBulkFailed(false);
    if (!teams || Object.keys(teams).length === 0) {
      setBulkFailed(true);
      setBulkResult("Add teams before uploading students.");
      return;
    }
    const parsed = parseStudentCsvPaste(bulkPaste);
    if (!parsed.ok) {
      setBulkFailed(true);
      setBulkResult(parsed.error);
      return;
    }
    const duplicateRows = parsed.rows.filter((r) => students?.[r.studentId.trim()]);
    if (duplicateRows.length > 0) {
      const detail = duplicateRows
        .slice(0, 5)
        .map((r) => {
          const ex = students![r.studentId.trim()];
          return `Line ${r.line} (${r.studentId}): already exists — ${describeExistingStudent(
            r.studentId,
            ex,
            teams
          )}`;
        })
        .join("; ");
      setBulkFailed(true);
      setBulkResult(
        `${duplicateRows.length} row(s) use an existing student ID. Fix or remove those lines before upload. ${detail}${
          duplicateRows.length > 5 ? " …" : ""
        }`
      );
      return;
    }
    setBulkBusy(true);
    try {
      const result = await bulkAddStudents(
        tournamentId,
        parsed.rows.map((r) => ({
          line: r.line,
          studentId: r.studentId,
          name: r.name,
          teamCodeOrId: r.teamCodeOrId,
          divisionId: r.divisionId,
        })),
        teams,
        { gradeId }
      );
      if (result.errors.length === 0) {
        setBulkResult(`Saved ${result.saved} student(s).`);
        setBulkPaste("");
      } else {
        setBulkFailed(result.saved === 0);
        const detail = result.errors
          .slice(0, 5)
          .map((e) =>
            e.line
              ? `Line ${e.line} (${e.studentId ?? "?"}): ${e.message}`
              : `${e.studentId ?? "?"}: ${e.message}`
          )
          .join("; ");
        setBulkResult(
          `Saved ${result.saved}; ${result.errors.length} error(s). ${detail}${
            result.errors.length > 5 ? " …" : ""
          }`
        );
      }
    } catch (err) {
      setBulkFailed(true);
      setBulkResult(err instanceof Error ? err.message : "Bulk upload failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="font-display text-lg font-semibold">Students</h2>
      <p className="text-sm text-cup-muted">
        Link each student to a team using its <strong>code</strong> (e.g.{" "}
        <span className="font-mono text-xs">FC3A001</span>), <strong>team name</strong>, or
        Firebase team id. Upload uses the selected grade <strong>{gradeId}</strong> when a
        code is shared across grades. Stored records always use the canonical team id.
      </p>
      <p className="text-xs text-cup-muted">
        <strong>Student IDs are unique for the whole tournament</strong> (not per grade). The
        roster below follows the header grade selector
        {totalStudentCount > 0
          ? ` — showing ${rosterRows.length}${showAllGrades ? "" : ` of ${totalStudentCount}`} student(s)${
              !showAllGrades && studentsOutsideGrade > 0
                ? ` (${studentsOutsideGrade} in other grades hidden)`
                : ""
            }`
          : ""}
        .
      </p>
      {duplicateCodes.length > 0 ? (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
          <p className="font-medium">Duplicate team codes detected</p>
          {duplicateCodes.map((d) => (
            <p key={d.code}>
              <span className="font-mono">{d.code}</span> on:{" "}
              {d.teamIds.map((id) => describeTeamMatch(id, teams ?? {})).join("; ")}
            </p>
          ))}
          <p>
            Fix codes under Teams so each team is unique, or add a 4th CSV column{" "}
            <span className="font-mono">A</span> or <span className="font-mono">B</span> for
            division (e.g. <span className="font-mono">s001,Maggie,FCA001,A</span>).
          </p>
        </div>
      ) : null}
      {teamCodes.length > 0 ? (
        <p className="text-xs text-cup-muted">
          Team codes in {gradeId}:{" "}
          <span className="font-mono">{teamCodes.join(", ")}</span>
        </p>
      ) : teams && Object.keys(teams).length > 0 ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
          No team codes set — bulk upload can still match by <strong>team name</strong>, or add a
          code under Teams → Code.
        </p>
      ) : null}
      {totalStudentCount > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAllGrades}
            onChange={(e) => setShowAllGrades(e.target.checked)}
          />
          Show all grades (check for duplicate IDs across the tournament)
        </label>
      ) : null}
      <form onSubmit={onAddStudent} className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span>Student ID (key)</span>
          <input
            className="border border-cup-line rounded-md px-3 py-2"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
          />
          {existingIdHint ? (
            <span className="text-xs text-amber-800">
              ID already used: {existingIdHint}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-sm flex-1 min-w-[160px]">
          <span>Name</span>
          <input
            className="border border-cup-line rounded-md px-3 py-2"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Team code (optional)</span>
          <input
            className="border border-cup-line rounded-md px-3 py-2 font-mono text-xs w-40"
            value={studentTeamCode}
            onChange={(e) => setStudentTeamCode(e.target.value)}
            placeholder="FC3A001"
          />
        </label>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium"
        >
          Save student
        </button>
      </form>
      {formError ? (
        <p className="text-sm text-red-700" role="alert">
          {formError}
        </p>
      ) : null}
      <form onSubmit={onBulkUpload} className="space-y-2 border-t border-cup-line pt-4">
        <h3 className="text-sm font-medium">Bulk upload (CSV)</h3>
        <p className="text-xs text-cup-muted">
          One row per line:{" "}
          <span className="font-mono">studentId,name,teamCode</span> or{" "}
          <span className="font-mono">studentId,name,teamCode,division</span> (A or B).
          Header row optional. Lines starting with # are ignored.
        </p>
        <textarea
          className="w-full min-h-[120px] border border-cup-line rounded-md px-3 py-2 font-mono text-xs"
          value={bulkPaste}
          onChange={(e) => setBulkPaste(e.target.value)}
          placeholder={`studentId,name,teamCode\ns001,Yamada Taro,FC3A001\ns002,Lee Min,FC3B001`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={bulkBusy || !bulkPaste.trim()}
            className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium disabled:opacity-50"
          >
            {bulkBusy ? "Uploading…" : "Upload students"}
          </button>
          {bulkResult ? (
            <p
              className={`text-sm ${bulkFailed ? "text-red-700 font-medium" : "text-green-800"}`}
              role="alert"
            >
              {bulkResult}
            </p>
          ) : null}
        </div>
      </form>
      {students && totalStudentCount > 0 ? (
        <div className="overflow-x-auto border border-cup-line rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-cup-ink/5 text-cup-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Name</th>
                {showAllGrades ? (
                  <th className="px-3 py-2 text-left">Grade</th>
                ) : null}
                <th className="px-3 py-2 text-left">Team code</th>
                {fairPlayEnabled ? (
                  <th className="px-3 py-2 text-right">Fair Play</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rosterRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={fairPlayEnabled ? (showAllGrades ? 5 : 4) : showAllGrades ? 4 : 3}
                    className="px-3 py-4 text-sm text-cup-muted"
                  >
                    {showAllGrades
                      ? "No students in this tournament yet."
                      : `No students linked to ${gradeId} teams yet${
                          teamCodes.length > 0
                            ? ` (e.g. ${teamCodes.slice(0, 3).join(", ")}${
                                teamCodes.length > 3 ? ", …" : ""
                              })`
                            : ""
                        }.`}
                  </td>
                </tr>
              ) : (
                rosterRows.map((s) => {
                  const code = teamCodeById(teams, s.teamId);
                  const rowGrade = teams?.[s.teamId ?? ""]?.gradeId;
                  return (
                    <tr key={s.id} className="border-t border-cup-line">
                      <td className="px-3 py-2 font-mono text-xs">{s.id}</td>
                      <td className="px-3 py-2">{s.name}</td>
                      {showAllGrades ? (
                        <td className="px-3 py-2 text-xs font-mono">{rowGrade ?? "—"}</td>
                      ) : null}
                      <td className="px-3 py-2 text-xs">
                        {code ? (
                          <span className="font-mono">{code}</span>
                        ) : s.teamId ? (
                          <span className="font-mono text-cup-muted">
                            {teams?.[s.teamId]?.name ?? s.teamId}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      {fairPlayEnabled ? (
                        <td className="px-3 py-2 text-right text-xs">
                          {typeof s.fairPlayInitialShare === "number" ? (
                            `${s.fairPlayPoints ?? 0}/${s.fairPlayInitialShare}`
                          ) : (
                            <span className="text-amber-700">not initialized</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function MatchScheduleForm({
  schedule,
  onSave,
  finalsHint,
  resurrectionHint,
}: {
  schedule?: MatchSchedule;
  onSave: (s: MatchSchedule | null) => Promise<void>;
  finalsHint?: boolean;
  resurrectionHint?: boolean;
}) {
  const [startLocal, setStartLocal] = useState("");
  const [dur, setDur] = useState("");
  const [court, setCourt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (schedule?.startAt != null) {
      setStartLocal(utcMsToTokyoDatetimeLocalValue(schedule.startAt));
    } else {
      setStartLocal("");
    }
    setDur(
      schedule?.durationRegulationMinutes != null
        ? String(schedule.durationRegulationMinutes)
        : ""
    );
    setCourt(schedule?.court ?? "");
  }, [schedule]);

  async function saveSchedule() {
    const ms = tokyoDatetimeLocalToUtcMs(startLocal);
    if (ms == null) {
      window.alert("Set a start date/time (Japan local), or use Clear schedule.");
      return;
    }
    const dTrim = dur.trim();
    let durationRegulationMinutes: number | undefined;
    if (dTrim !== "" && dTrim !== "16") {
      const n = Number(dTrim);
      if (!Number.isFinite(n) || n <= 0) {
        window.alert("Regulation minutes must be a positive number.");
        return;
      }
      durationRegulationMinutes = n;
    }
    const cTrim = court.trim();
    const payload: MatchSchedule = { startAt: ms };
    if (durationRegulationMinutes !== undefined) {
      payload.durationRegulationMinutes = durationRegulationMinutes;
    }
    if (cTrim) payload.court = cTrim;
    setBusy(true);
    try {
      await onSave(payload);
    } finally {
      setBusy(false);
    }
  }

  async function clearSchedule() {
    setBusy(true);
    try {
      await onSave(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-cup-line pt-2 mt-2 space-y-2 text-xs">
      <div className="text-cup-muted font-medium">Schedule (Japan time)</div>
      {resurrectionHint ? (
        <p className="text-cup-muted">
          Redemption: <strong>3 min</strong> regulation (one score pair);{" "}
          <strong>one extra round</strong> if tied; sudden death after that.
        </p>
      ) : finalsHint ? (
        <p className="text-cup-muted">
          Default <strong>16 min</strong> regulation; <strong>+8 min</strong> extra if tied.
        </p>
      ) : (
        <p className="text-cup-muted">Start time is entered in Japan local time.</p>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-0.5">
          <span>Start</span>
          <input
            type="datetime-local"
            className="border border-cup-line rounded-md px-2 py-1 bg-white"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span>Reg. min (optional)</span>
          <input
            className="border border-cup-line rounded-md px-2 py-1 w-20 bg-white"
            placeholder={resurrectionHint ? "3" : "16"}
            value={dur}
            onChange={(e) => setDur(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5 min-w-[6rem] flex-1">
          <span>Court (optional)</span>
          <input
            className="border border-cup-line rounded-md px-2 py-1 bg-white w-full max-w-[12rem]"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSchedule()}
          className="px-2 py-1 rounded bg-cup-ink text-cup-paper disabled:opacity-50"
        >
          Save schedule
        </button>
        <button
          type="button"
          disabled={busy || !schedule?.startAt}
          onClick={() => void clearSchedule()}
          className="px-2 py-1 rounded border border-cup-line disabled:opacity-50"
        >
          Clear schedule
        </button>
      </div>
    </div>
  );
}

function RoundGroupScheduleForm({
  rounds,
  onApply,
}: {
  rounds: number[];
  onApply: (round: number, s: MatchSchedule | null) => Promise<void>;
}) {
  const [round, setRound] = useState<number>(rounds[0] ?? 1);
  const [startLocal, setStartLocal] = useState("");
  const [dur, setDur] = useState("");
  const [court, setCourt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rounds.length === 0) return;
    if (!rounds.includes(round)) setRound(rounds[0]);
  }, [rounds, round]);

  async function apply() {
    const ms = tokyoDatetimeLocalToUtcMs(startLocal);
    if (ms == null) {
      window.alert("Set a start date/time (Japan local) first.");
      return;
    }
    const dTrim = dur.trim();
    let durationRegulationMinutes: number | undefined;
    if (dTrim !== "" && dTrim !== "16") {
      const n = Number(dTrim);
      if (!Number.isFinite(n) || n <= 0) {
        window.alert("Regulation minutes must be a positive number.");
        return;
      }
      durationRegulationMinutes = n;
    }
    const cTrim = court.trim();
    const payload: MatchSchedule = { startAt: ms };
    if (durationRegulationMinutes !== undefined) {
      payload.durationRegulationMinutes = durationRegulationMinutes;
    }
    if (cTrim) payload.court = cTrim;
    setBusy(true);
    try {
      await onApply(round, payload);
    } finally {
      setBusy(false);
    }
  }

  async function clearRoundSchedules() {
    setBusy(true);
    try {
      await onApply(round, null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-cup-line rounded-lg p-3 bg-white text-xs space-y-2">
      <p className="font-medium text-cup-ink">
        Group schedule: apply one time to all matches in a match number
      </p>
      {rounds.length === 0 ? (
        <p className="text-cup-muted">Generate round-robin first.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col gap-0.5">
              <span>Match</span>
              <select
                value={round}
                onChange={(e) => setRound(Number(e.target.value))}
                className="border border-cup-line rounded-md px-2 py-1 bg-white"
              >
                {rounds.map((r) => (
                  <option key={r} value={r}>
                    Match {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Start (JP)</span>
              <input
                type="datetime-local"
                className="border border-cup-line rounded-md px-2 py-1 bg-white"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Reg. min (optional)</span>
              <input
                className="border border-cup-line rounded-md px-2 py-1 w-20 bg-white"
                placeholder="16"
                value={dur}
                onChange={(e) => setDur(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Court (optional)</span>
              <input
                className="border border-cup-line rounded-md px-2 py-1 w-28 bg-white"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply()}
              className="px-2 py-1 rounded bg-cup-ink text-cup-paper disabled:opacity-50"
            >
              Apply to Match {round}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearRoundSchedules()}
              className="px-2 py-1 rounded border border-cup-line disabled:opacity-50"
            >
              Clear schedules in Match {round}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function QualifyingMatchEditor({
  m,
  nameById,
  onSave,
}: {
  m: QualifyingMatchData;
  nameById: Map<string, string>;
  onSave: (reg: {
    round1: { scoreA: number; scoreB: number };
    round2: { scoreA: number; scoreB: number };
  }) => Promise<void>;
}) {
  const [r1a, setR1a] = useState("0");
  const [r1b, setR1b] = useState("0");
  const [r2a, setR2a] = useState("0");
  const [r2b, setR2b] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (m.regulation) {
      setR1a(String(m.regulation.round1.scoreA));
      setR1b(String(m.regulation.round1.scoreB));
      setR2a(String(m.regulation.round2.scoreA));
      setR2b(String(m.regulation.round2.scoreB));
    }
  }, [m.regulation]);

  if (m.status === "COMPLETED" && m.regulation && m.outcome) {
    const { totalA, totalB } = regulationTotals(m.regulation);
    return (
      <div className="border border-cup-line rounded-lg px-3 py-2 text-sm bg-cup-ink/5">
        <div>
          <span className="font-mono text-xs">{m.id}</span> ·{" "}
          <strong>{nameById.get(m.teamAId)}</strong> vs{" "}
          <strong>{nameById.get(m.teamBId)}</strong> — {totalA}-{totalB} (
          {m.outcome})
        </div>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        round1: { scoreA: Number(r1a), scoreB: Number(r1b) },
        round2: { scoreA: Number(r2a), scoreB: Number(r2b) },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border border-cup-line rounded-lg p-3 text-sm space-y-2 bg-white"
    >
      <div className="font-mono text-xs text-cup-muted">{m.id}</div>
      <div>
        <strong>{nameById.get(m.teamAId)}</strong> vs{" "}
        <strong>{nameById.get(m.teamBId)}</strong> (R{m.round}
        {m.leagueId ? ` · ${m.leagueId}` : ""})
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-cup-muted text-xs">R1</span>
        <input
          className="border rounded w-14 px-1 py-1"
          value={r1a}
          onChange={(e) => setR1a(e.target.value)}
        />
        <input
          className="border rounded w-14 px-1 py-1"
          value={r1b}
          onChange={(e) => setR1b(e.target.value)}
        />
        <span className="text-cup-muted text-xs">R2</span>
        <input
          className="border rounded w-14 px-1 py-1"
          value={r2a}
          onChange={(e) => setR2a(e.target.value)}
        />
        <input
          className="border rounded w-14 px-1 py-1"
          value={r2b}
          onChange={(e) => setR2b(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="ml-2 px-3 py-1 rounded bg-cup-accent text-white text-xs font-medium disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function ResurrectionMatchEditor({
  m,
  tournamentId,
  grade,
  group,
  nameById,
}: {
  m: FinalMatchData;
  tournamentId: string;
  grade: string;
  group: ResurrectionPoolGroup;
  nameById: Map<string, string>;
}) {
  const [r1a, setR1a] = useState("0");
  const [r1b, setR1b] = useState("0");
  const [exA, setExA] = useState("0");
  const [exB, setExB] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (m.regulation) {
      setR1a(String(m.regulation.round1.scoreA));
      setR1b(String(m.regulation.round1.scoreB));
    }
    if (m.extra8min?.round) {
      setExA(String(m.extra8min.round.scoreA));
      setExB(String(m.extra8min.round.scoreB));
    }
  }, [m.regulation, m.extra8min]);

  if (m.status === "COMPLETED" && m.winnerTeamId) {
    return (
      <div className="border border-cup-line rounded-lg px-3 py-2 text-sm bg-green-50 border-green-200">
        <div>
          <span className="font-mono text-xs">{m.id}</span> · Winner:{" "}
          <strong>{nameById.get(m.winnerTeamId)}</strong>
        </div>
        <MatchScheduleForm
          schedule={m.schedule}
          resurrectionHint
          onSave={(s) =>
            updateResurrectionSchedule(tournamentId, grade, group, m.id, s)
          }
        />
      </div>
    );
  }

  if (!m.teamAId || !m.teamBId) {
    return (
      <div className="border border-dashed border-cup-line rounded-lg px-3 py-2 text-xs text-cup-muted">
        <div>{m.id} — waiting for teams</div>
        <MatchScheduleForm
          schedule={m.schedule}
          resurrectionHint
          onSave={(s) =>
            updateResurrectionSchedule(tournamentId, grade, group, m.id, s)
          }
        />
      </div>
    );
  }

  const totals = m.regulation ? regulationTotals(m.regulation) : null;
  const regTie =
    totals !== null && totals.totalA === totals.totalB && m.status !== "COMPLETED";
  const showRegForm = !m.regulation;
  const showExtra =
    Boolean(m.regulation) &&
    regTie &&
    !m.extra8min &&
    !m.suddenDeath;

  async function saveReg(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitResurrectionRegulation(tournamentId, grade, group, m, {
        scoreA: Number(r1a),
        scoreB: Number(r1b),
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveExtra(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitResurrectionExtraEight(tournamentId, grade, group, m, {
        scoreA: Number(exA),
        scoreB: Number(exB),
      });
    } finally {
      setBusy(false);
    }
  }

  async function sd(closer: "A" | "B" | "TIE") {
    setBusy(true);
    try {
      await submitResurrectionSuddenDeathCloser(
        tournamentId,
        grade,
        group,
        m,
        closer
      );
    } finally {
      setBusy(false);
    }
  }

  const showSuddenDeath = m.suddenDeath?.status === "IN_PROGRESS";

  return (
    <div className="border border-cup-line rounded-lg p-3 space-y-3 bg-white">
      <div className="font-mono text-xs text-cup-muted">{m.id}</div>
      <div>
        <strong>{nameById.get(m.teamAId)}</strong> vs{" "}
        <strong>{nameById.get(m.teamBId)}</strong>
      </div>
      {showRegForm ? (
        <form onSubmit={saveReg} className="flex flex-wrap gap-2 items-center text-xs">
          <span>3 min (one pair)</span>
          <input className="border rounded w-12 px-1" value={r1a} onChange={(e) => setR1a(e.target.value)} />
          <input className="border rounded w-12 px-1" value={r1b} onChange={(e) => setR1b(e.target.value)} />
          <button type="submit" disabled={busy} className="px-2 py-1 rounded bg-cup-accent text-white">
            Save regulation
          </button>
        </form>
      ) : null}

      {showExtra ? (
        <form onSubmit={saveExtra} className="flex flex-wrap gap-2 items-center text-xs border-t border-cup-line pt-2">
          <span className="text-cup-muted">Extra period (1 round)</span>
          <input className="border rounded w-12 px-1" value={exA} onChange={(e) => setExA(e.target.value)} />
          <input className="border rounded w-12 px-1" value={exB} onChange={(e) => setExB(e.target.value)} />
          <button type="submit" disabled={busy} className="px-2 py-1 rounded bg-cup-ink text-cup-paper">
            Save extra
          </button>
        </form>
      ) : null}

      {showSuddenDeath ? (
        <div className="text-xs border-t border-cup-line pt-2 space-y-1">
          <div className="text-cup-muted">
            Sudden death (cycle {m.suddenDeath?.cycleIndex ?? 0})
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={busy} className="px-2 py-1 rounded border" onClick={() => void sd("A")}>
              Closer: A
            </button>
            <button type="button" disabled={busy} className="px-2 py-1 rounded border" onClick={() => void sd("B")}>
              Closer: B
            </button>
            <button type="button" disabled={busy} className="px-2 py-1 rounded border" onClick={() => void sd("TIE")}>
              Tie → next cycle
            </button>
          </div>
        </div>
      ) : null}
      <MatchScheduleForm
        schedule={m.schedule}
        resurrectionHint
        onSave={(s) =>
          updateResurrectionSchedule(tournamentId, grade, group, m.id, s)
        }
      />
    </div>
  );
}

function FinalMatchEditor({
  m,
  tournamentId,
  grade,
  nameById,
}: {
  m: FinalMatchData;
  tournamentId: string;
  grade: string;
  nameById: Map<string, string>;
}) {
  const [r1a, setR1a] = useState("0");
  const [r1b, setR1b] = useState("0");
  const [r2a, setR2a] = useState("0");
  const [r2b, setR2b] = useState("0");
  const [exA, setExA] = useState("0");
  const [exB, setExB] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (m.regulation) {
      setR1a(String(m.regulation.round1.scoreA));
      setR1b(String(m.regulation.round1.scoreB));
      setR2a(String(m.regulation.round2.scoreA));
      setR2b(String(m.regulation.round2.scoreB));
    }
    if (m.extra8min?.round) {
      setExA(String(m.extra8min.round.scoreA));
      setExB(String(m.extra8min.round.scoreB));
    }
  }, [m.regulation, m.extra8min]);

  if (m.status === "COMPLETED" && m.winnerTeamId) {
    return (
      <div className="border border-cup-line rounded-lg px-3 py-2 text-sm bg-green-50 border-green-200">
        <div>
          <span className="font-mono text-xs">{m.id}</span> · Winner:{" "}
          <strong>{nameById.get(m.winnerTeamId)}</strong>
        </div>
        <MatchScheduleForm
          schedule={m.schedule}
          finalsHint
          onSave={(s) => updateFinalSchedule(tournamentId, grade, m.id, s)}
        />
      </div>
    );
  }

  if (!m.teamAId || !m.teamBId) {
    return (
      <div className="border border-dashed border-cup-line rounded-lg px-3 py-2 text-xs text-cup-muted">
        <div>{m.id} — waiting for teams</div>
        <MatchScheduleForm
          schedule={m.schedule}
          finalsHint
          onSave={(s) => updateFinalSchedule(tournamentId, grade, m.id, s)}
        />
      </div>
    );
  }

  const totals = m.regulation ? regulationTotals(m.regulation) : null;
  const regTie =
    totals !== null && totals.totalA === totals.totalB && m.status !== "COMPLETED";
  const showRegForm = !m.regulation;
  const showExtra =
    Boolean(m.regulation) &&
    regTie &&
    !m.extra8min &&
    !m.suddenDeath;

  async function saveReg(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitFinalRegulation(tournamentId, grade, m, {
        round1: { scoreA: Number(r1a), scoreB: Number(r1b) },
        round2: { scoreA: Number(r2a), scoreB: Number(r2b) },
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveExtra(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitFinalExtraEight(tournamentId, grade, m, {
        scoreA: Number(exA),
        scoreB: Number(exB),
      });
    } finally {
      setBusy(false);
    }
  }

  async function sd(closer: "A" | "B" | "TIE") {
    setBusy(true);
    try {
      await submitSuddenDeathCloser(tournamentId, grade, m, closer);
    } finally {
      setBusy(false);
    }
  }

  const showSuddenDeath = m.suddenDeath?.status === "IN_PROGRESS";

  return (
    <div className="border border-cup-line rounded-lg p-3 space-y-3 bg-white">
      <div className="font-mono text-xs text-cup-muted">{m.id}</div>
      <div>
        <strong>{nameById.get(m.teamAId)}</strong> vs{" "}
        <strong>{nameById.get(m.teamBId)}</strong>
      </div>
      {showRegForm ? (
        <form onSubmit={saveReg} className="flex flex-wrap gap-2 items-center text-xs">
          <span>R1</span>
          <input className="border rounded w-12 px-1" value={r1a} onChange={(e) => setR1a(e.target.value)} />
          <input className="border rounded w-12 px-1" value={r1b} onChange={(e) => setR1b(e.target.value)} />
          <span>R2</span>
          <input className="border rounded w-12 px-1" value={r2a} onChange={(e) => setR2a(e.target.value)} />
          <input className="border rounded w-12 px-1" value={r2b} onChange={(e) => setR2b(e.target.value)} />
          <button type="submit" disabled={busy} className="px-2 py-1 rounded bg-cup-accent text-white">
            Save regulation
          </button>
        </form>
      ) : null}

      {showExtra ? (
        <form onSubmit={saveExtra} className="flex flex-wrap gap-2 items-center text-xs border-t border-cup-line pt-2">
          <span className="text-cup-muted">Extra 8 min (1 round)</span>
          <input className="border rounded w-12 px-1" value={exA} onChange={(e) => setExA(e.target.value)} />
          <input className="border rounded w-12 px-1" value={exB} onChange={(e) => setExB(e.target.value)} />
          <button type="submit" disabled={busy} className="px-2 py-1 rounded bg-cup-ink text-cup-paper">
            Save extra
          </button>
        </form>
      ) : null}

      {showSuddenDeath ? (
        <div className="text-xs border-t border-cup-line pt-2 space-y-1">
          <div className="text-cup-muted">
            Sudden death (cycle {m.suddenDeath?.cycleIndex ?? 0})
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={busy} className="px-2 py-1 rounded border" onClick={() => void sd("A")}>
              Closer: A
            </button>
            <button type="button" disabled={busy} className="px-2 py-1 rounded border" onClick={() => void sd("B")}>
              Closer: B
            </button>
            <button type="button" disabled={busy} className="px-2 py-1 rounded border" onClick={() => void sd("TIE")}>
              Tie → next cycle
            </button>
          </div>
        </div>
      ) : null}
      <MatchScheduleForm
        schedule={m.schedule}
        finalsHint
        onSave={(s) => updateFinalSchedule(tournamentId, grade, m.id, s)}
      />
    </div>
  );
}
