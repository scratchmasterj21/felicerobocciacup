import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTournamentId } from "@/hooks/useTournamentId";
import {
  getDivisionLeagueCount,
  getQualifyingLeagueAssignment,
  subscribeFinalMatches,
  subscribeQualifyingMatches,
  subscribeResurrectionMatches,
  subscribeResurrectionMeta,
  subscribeSchools,
  subscribeTeams,
  subscribeTournamentMeta,
} from "@/lib/firebase/tournamentService";
import type { QualifyingMatchData } from "@/lib/tournament/types";
import type { FinalMatchData, ResurrectionMeta } from "@/lib/tournament/types";
import { compareFinalByRoundThenScheduleThenSlot } from "@/lib/schedule/matchSort";
import { rankStandings } from "@/lib/tournament/standings";
import { StandingsTable } from "@/components/StandingsTable";
import { BracketRounds } from "@/components/BracketRounds";
import { QualifyingScheduleList } from "@/components/QualifyingScheduleList";
import { QualifyingScheduleByRound } from "@/components/QualifyingScheduleByRound";
import { divisionLabel } from "@/lib/tournament/divisionLabels";
import {
  buildTeamDisplayNameById,
  schoolShortByIdFromRecord,
} from "@/lib/tournament/teamDisplay";
import type { LeagueId } from "@/lib/tournament/leagueSplit";
import {
  effectiveLeagueCount,
  partitionTeamsIntoLeaguesFromSaved,
} from "@/lib/tournament/leagueSplit";
import { parseViewerDisplayParams, VIEWER_GRADES } from "@/lib/viewerDisplay";

export function ViewerPage() {
  const [tournamentId, setTournamentId] = useTournamentId();
  const [searchParams] = useSearchParams();
  const [grade, setGrade] = useState<string>("G1");
  const { display: displayMode, kiosk: kioskMode } = useMemo(
    () => parseViewerDisplayParams(searchParams.toString()),
    [searchParams]
  );
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
        schoolId?: string;
      }
    >
  | null>(null);
  const [schools, setSchools] = useState<
    Record<string, { name: string; shortLabel?: string }> | null
  >(null);
  const [qMatches, setQMatches] = useState<Record<string, QualifyingMatchData> | null>(null);
  const [fMatches, setFMatches] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMetaA, setResMetaA] = useState<ResurrectionMeta | null>(null);
  const [resMetaB, setResMetaB] = useState<ResurrectionMeta | null>(null);
  const [resMetaU, setResMetaU] = useState<ResurrectionMeta | null>(null);
  const [resMatchesA, setResMatchesA] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMatchesB, setResMatchesB] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMatchesU, setResMatchesU] = useState<Record<string, FinalMatchData> | null>(null);

  useEffect(() => {
    const tid = searchParams.get("tournamentId");
    if (tid) setTournamentId(tid);
  }, [searchParams, setTournamentId]);

  useEffect(() => {
    const g = parseViewerDisplayParams(searchParams.toString()).grade;
    if (g) setGrade(g);
  }, [searchParams]);

  useEffect(() => {
    return subscribeTournamentMeta(tournamentId, (m) => setMeta(m));
  }, [tournamentId]);

  useEffect(() => {
    return subscribeTeams(tournamentId, setTeams);
  }, [tournamentId]);

  useEffect(() => {
    return subscribeSchools(tournamentId, setSchools);
  }, [tournamentId]);

  useEffect(() => {
    return subscribeQualifyingMatches(tournamentId, setQMatches);
  }, [tournamentId]);

  useEffect(() => {
    return subscribeFinalMatches(tournamentId, grade, setFMatches);
  }, [tournamentId, grade]);

  const isUnified =
    meta?.qualifyingMode === "unified" ||
    meta?.tournamentKind === "interSchool";

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

  const teamsA = useMemo(
    () =>
      teamList
        .filter((t) => t.gradeId === grade && t.divisionId === "A")
        .map((t) => t.id),
    [teamList, grade]
  );
  const teamsB = useMemo(
    () =>
      teamList
        .filter((t) => t.gradeId === grade && t.divisionId === "B")
        .map((t) => t.id),
    [teamList, grade]
  );

  const qualA = useMemo(() => {
    const all = Object.values(qMatches ?? {});
    return all.filter((m) => m.gradeId === grade && m.divisionId === "A");
  }, [qMatches, grade]);
  const qualB = useMemo(() => {
    const all = Object.values(qMatches ?? {});
    return all.filter((m) => m.gradeId === grade && m.divisionId === "B");
  }, [qMatches, grade]);

  const standA = useMemo(() => rankStandings(teamsA, qualA), [teamsA, qualA]);
  const standB = useMemo(() => rankStandings(teamsB, qualB), [teamsB, qualB]);
  const requestedLeagueCountA = useMemo(
    () => getDivisionLeagueCount(meta, grade, "A"),
    [meta, grade]
  );
  const requestedLeagueCountB = useMemo(
    () => getDivisionLeagueCount(meta, grade, "B"),
    [meta, grade]
  );
  const effLeagueCountA = effectiveLeagueCount(requestedLeagueCountA, teamsA.length);
  const effLeagueCountB = effectiveLeagueCount(requestedLeagueCountB, teamsB.length);
  const leagueTeamsA = useMemo(
    () =>
      effLeagueCountA === 2
        ? partitionTeamsIntoLeaguesFromSaved(
            teamsA,
            getQualifyingLeagueAssignment(meta, grade, "A")
          )
        : { L1: teamsA, L2: [] },
    [teamsA, effLeagueCountA, meta, grade]
  );
  const leagueTeamsB = useMemo(
    () =>
      effLeagueCountB === 2
        ? partitionTeamsIntoLeaguesFromSaved(
            teamsB,
            getQualifyingLeagueAssignment(meta, grade, "B")
          )
        : { L1: teamsB, L2: [] },
    [teamsB, effLeagueCountB, meta, grade]
  );
  const qualA_L1 = useMemo(() => qualA.filter((m) => (m.leagueId ?? "L1") === "L1"), [qualA]);
  const qualA_L2 = useMemo(() => qualA.filter((m) => m.leagueId === "L2"), [qualA]);
  const qualB_L1 = useMemo(() => qualB.filter((m) => (m.leagueId ?? "L1") === "L1"), [qualB]);
  const qualB_L2 = useMemo(() => qualB.filter((m) => m.leagueId === "L2"), [qualB]);
  const standA_L1 = useMemo(
    () => rankStandings(leagueTeamsA.L1, qualA_L1),
    [leagueTeamsA, qualA_L1]
  );
  const standA_L2 = useMemo(
    () => rankStandings(leagueTeamsA.L2, qualA_L2),
    [leagueTeamsA, qualA_L2]
  );
  const standB_L1 = useMemo(
    () => rankStandings(leagueTeamsB.L1, qualB_L1),
    [leagueTeamsB, qualB_L1]
  );
  const standB_L2 = useMemo(
    () => rankStandings(leagueTeamsB.L2, qualB_L2),
    [leagueTeamsB, qualB_L2]
  );

  const schoolShortById = useMemo(
    () => schoolShortByIdFromRecord(schools),
    [schools]
  );

  const nameById = useMemo(
    () => buildTeamDisplayNameById(teamList, schoolShortById),
    [teamList, schoolShortById]
  );

  const finalMatchList = useMemo(() => Object.values(fMatches ?? {}), [fMatches]);
  const finalsA = useMemo(
    () =>
      finalMatchList.filter(
        (m) => m.bracketGroup === "A" || (!isUnified && m.bracketGroup == null)
      ),
    [finalMatchList, isUnified]
  );
  const finalsB = useMemo(
    () => finalMatchList.filter((m) => m.bracketGroup === "B"),
    [finalMatchList]
  );
  const finalsUnified = useMemo(
    () => finalMatchList.filter((m) => m.bracketGroup === "U" || m.bracketGroup == null),
    [finalMatchList]
  );

  const resListU = useMemo(
    () =>
      Object.values(resMatchesU ?? {}).sort(
        compareFinalByRoundThenScheduleThenSlot
      ),
    [resMatchesU]
  );
  const resListA = useMemo(
    () =>
      Object.values(resMatchesA ?? {}).sort(
        compareFinalByRoundThenScheduleThenSlot
      ),
    [resMatchesA]
  );
  const resListB = useMemo(
    () =>
      Object.values(resMatchesB ?? {}).sort(
        compareFinalByRoundThenScheduleThenSlot
      ),
    [resMatchesB]
  );

  const h2Section = displayMode
    ? "font-display text-2xl md:text-3xl font-semibold mb-3"
    : "font-display text-lg font-semibold mb-3";
  const h3League = displayMode
    ? "text-sm md:text-base font-semibold text-cup-muted mb-1"
    : "text-xs font-semibold text-cup-muted mb-1";
  const h3Bracket = displayMode
    ? "text-base md:text-lg font-semibold text-cup-muted mb-2"
    : "text-sm font-semibold text-cup-muted mb-2";
  const h2Major = displayMode
    ? "font-display text-2xl md:text-3xl font-semibold"
    : "font-display text-lg font-semibold";
  const bodyMuted = displayMode
    ? "text-base text-cup-muted max-w-2xl"
    : "text-sm text-cup-muted max-w-2xl";
  const bodyMutedNarrow = displayMode
    ? "text-base text-cup-muted max-w-xl"
    : "text-sm text-cup-muted max-w-xl";
  const interSchoolBanner = displayMode
    ? "text-base font-medium text-cup-ink border border-cup-line rounded-lg px-4 py-3 bg-cup-paper/50 max-w-2xl"
    : "text-sm font-medium text-cup-ink border border-cup-line rounded-lg px-3 py-2 bg-cup-paper/50 max-w-xl";

  const normalViewSearch = useMemo(() => {
    const p = new URLSearchParams();
    const tid = searchParams.get("tournamentId");
    if (tid) p.set("tournamentId", tid);
    const g = searchParams.get("grade");
    if (g) p.set("grade", g);
    return p.toString();
  }, [searchParams]);

  return (
    <div className={displayMode ? "space-y-10" : "space-y-8"}>
      {!displayMode ? (
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-cup-muted font-medium">Tournament ID</span>
            <input
              className="border border-cup-line rounded-md px-3 py-2 bg-white min-w-[200px]"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-cup-muted font-medium">Grade</span>
            <select
              className="border border-cup-line rounded-md px-3 py-2 bg-white"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              {VIEWER_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {displayMode && kioskMode ? (
        <header className="text-center border-b border-cup-line pb-6 mb-2">
          <h1 className="font-display text-3xl md:text-5xl font-semibold text-cup-ink tracking-tight">
            {meta?.name ?? "Tournament"}
          </h1>
          <p className="text-cup-muted text-xl md:text-2xl mt-3 font-medium">{grade}</p>
          {meta ? (
            <p className="text-cup-muted text-lg mt-1">School year {meta.schoolYear}</p>
          ) : null}
        </header>
      ) : null}

      {meta && !(displayMode && kioskMode) ? (
        <div className="space-y-2">
          <h1
            className={
              displayMode
                ? "font-display text-3xl md:text-4xl font-semibold text-cup-ink"
                : "font-display text-2xl font-semibold text-cup-ink"
            }
          >
            {meta.name}{" "}
            <span
              className={
                displayMode
                  ? "text-cup-muted font-sans text-xl md:text-2xl font-normal"
                  : "text-cup-muted font-sans text-lg font-normal"
              }
            >
              ({meta.schoolYear})
            </span>
          </h1>
          {meta.tournamentKind === "interSchool" ? (
            <p className={interSchoolBanner}>
              Inter-school event — unified qualifying league and school-vs-school fixtures when
              two schools are registered.
            </p>
          ) : null}
        </div>
      ) : null}

      {isUnified ? (
        <p className={bodyMutedNarrow}>
          Unified qualifying: one league in Pool A; Pool B is not used for this tournament.
        </p>
      ) : null}

      <section
        className={
          isUnified ? "grid gap-8" : "grid md:grid-cols-2 gap-8"
        }
      >
        <div>
          <h2 className={h2Section}>
            Qualifying — {grade} · {divisionLabel(meta, "A")}
          </h2>
          {effLeagueCountA === 2 ? (
            <div className="space-y-4">
              <div>
                <h3 className={h3League}>League 1</h3>
                <StandingsTable
                  standings={standA_L1}
                  nameById={nameById}
                  projector={displayMode}
                />
              </div>
              <div>
                <h3 className={h3League}>League 2</h3>
                <StandingsTable
                  standings={standA_L2}
                  nameById={nameById}
                  projector={displayMode}
                />
              </div>
            </div>
          ) : (
            <StandingsTable standings={standA} nameById={nameById} projector={displayMode} />
          )}
        </div>
        {!isUnified ? (
          <div>
            <h2 className={h2Section}>
              Qualifying — {grade} · {divisionLabel(meta, "B")}
            </h2>
            {effLeagueCountB === 2 ? (
              <div className="space-y-4">
                <div>
                  <h3 className={h3League}>League 1</h3>
                  <StandingsTable
                    standings={standB_L1}
                    nameById={nameById}
                    projector={displayMode}
                  />
                </div>
                <div>
                  <h3 className={h3League}>League 2</h3>
                  <StandingsTable
                    standings={standB_L2}
                    nameById={nameById}
                    projector={displayMode}
                  />
                </div>
              </div>
            ) : (
              <StandingsTable standings={standB} nameById={nameById} projector={displayMode} />
            )}
          </div>
        ) : null}
      </section>

      <section
        className={
          isUnified ? "grid gap-8" : "grid md:grid-cols-2 gap-8"
        }
      >
        {!isUnified && effLeagueCountA === 1 && effLeagueCountB === 1 ? (
          <div className="md:col-span-2">
            <QualifyingScheduleByRound
              title={`Schedule — ${grade}`}
              divisionLabelA={divisionLabel(meta, "A")}
              divisionLabelB={divisionLabel(meta, "B")}
              matchesA={qualA}
              matchesB={qualB}
              nameById={nameById}
              projector={displayMode}
            />
          </div>
        ) : effLeagueCountA === 2 ? (
          <div className="space-y-4">
            <QualifyingScheduleList
              title={`Schedule — ${grade} · ${divisionLabel(meta, "A")} · League 1`}
              matches={qualA_L1}
              nameById={nameById}
              projector={displayMode}
            />
            <QualifyingScheduleList
              title={`Schedule — ${grade} · ${divisionLabel(meta, "A")} · League 2`}
              matches={qualA_L2}
              nameById={nameById}
              projector={displayMode}
            />
          </div>
        ) : (
          <QualifyingScheduleList
            title={`Schedule — ${grade} · ${divisionLabel(meta, "A")}`}
            matches={qualA}
            nameById={nameById}
            projector={displayMode}
          />
        )}
        {!isUnified && !(effLeagueCountA === 1 && effLeagueCountB === 1) ? (
          effLeagueCountB === 2 ? (
            <div className="space-y-4">
              <QualifyingScheduleList
                title={`Schedule — ${grade} · ${divisionLabel(meta, "B")} · League 1`}
                matches={qualB_L1}
                nameById={nameById}
                projector={displayMode}
              />
              <QualifyingScheduleList
                title={`Schedule — ${grade} · ${divisionLabel(meta, "B")} · League 2`}
                matches={qualB_L2}
                nameById={nameById}
                projector={displayMode}
              />
            </div>
          ) : (
            <QualifyingScheduleList
              title={`Schedule — ${grade} · ${divisionLabel(meta, "B")}`}
              matches={qualB}
              nameById={nameById}
              projector={displayMode}
            />
          )
        ) : null}
      </section>

      <section className="space-y-6">
        <h2 className={h2Major}>Resurrection bracket — {grade}</h2>
        <p className={bodyMuted}>
          Knockout for teams below the direct-qualifier cut (3 min regulation, extra period if
          tied, then sudden death). The winner may be added to the main finals when admins generate
          the bracket.
        </p>
        {isUnified ? (
          <div className="space-y-2">
            {resMetaU?.completedWinnerTeamId ? (
              <p
                className={
                  displayMode ? "text-base font-medium text-cup-win" : "text-sm font-medium text-cup-win"
                }
              >
                Resurrection winner:{" "}
                {nameById.get(resMetaU.completedWinnerTeamId) ??
                  resMetaU.completedWinnerTeamId}
              </p>
            ) : null}
            <div className="min-w-0 overflow-x-hidden">
              <BracketRounds
                matches={resListU}
                nameById={nameById}
                emptyMessage="No resurrection bracket for this grade yet (or a single below-cut team was auto-crowned with no matches)."
                winnerBannerTitle="Winner"
                footerHint="3 min regulation + one extra period if tied (+ sudden death if needed)"
              />
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="min-w-0">
              <h3 className={h3Bracket}>{grade} · {divisionLabel(meta, "A")} resurrection</h3>
              {resMetaA?.completedWinnerTeamId ? (
                <p
                  className={
                    displayMode
                      ? "text-base font-medium text-cup-win mb-2"
                      : "text-sm font-medium text-cup-win mb-2"
                  }
                >
                  Winner:{" "}
                  {nameById.get(resMetaA.completedWinnerTeamId) ??
                    resMetaA.completedWinnerTeamId}
                </p>
              ) : null}
              <div className="min-w-0 overflow-x-hidden">
                <BracketRounds
                  matches={resListA}
                  nameById={nameById}
                  emptyMessage="No resurrection bracket for this pool yet."
                  winnerBannerTitle="Winner"
                  footerHint="3 min regulation + one extra period if tied (+ sudden death if needed)"
                />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className={h3Bracket}>{grade} · {divisionLabel(meta, "B")} resurrection</h3>
              {resMetaB?.completedWinnerTeamId ? (
                <p
                  className={
                    displayMode
                      ? "text-base font-medium text-cup-win mb-2"
                      : "text-sm font-medium text-cup-win mb-2"
                  }
                >
                  Winner:{" "}
                  {nameById.get(resMetaB.completedWinnerTeamId) ??
                    resMetaB.completedWinnerTeamId}
                </p>
              ) : null}
              <div className="min-w-0 overflow-x-hidden">
                <BracketRounds
                  matches={resListB}
                  nameById={nameById}
                  emptyMessage="No resurrection bracket for this pool yet."
                  winnerBannerTitle="Winner"
                  footerHint="3 min regulation + one extra period if tied (+ sudden death if needed)"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className={`${h2Major} mb-3`}>Finals bracket — {grade}</h2>
        {isUnified ? (
          <div className="min-w-0 overflow-x-hidden">
            <BracketRounds matches={finalsUnified} nameById={nameById} />
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="min-w-0">
              <h3 className={h3Bracket}>{grade} · {divisionLabel(meta, "A")} finals</h3>
              <div className="min-w-0 overflow-x-hidden">
                <BracketRounds matches={finalsA} nameById={nameById} />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className={h3Bracket}>{grade} · {divisionLabel(meta, "B")} finals</h3>
              <div className="min-w-0 overflow-x-hidden">
                <BracketRounds matches={finalsB} nameById={nameById} />
              </div>
            </div>
          </div>
        )}
      </section>

      {kioskMode ? (
        <p className="text-center text-sm text-cup-muted pt-4 border-t border-cup-line">
          <Link
            to={{
              pathname: "/",
              search: normalViewSearch || undefined,
            }}
            className="text-cup-accent underline hover:no-underline"
          >
            Normal view
          </Link>
          {" · "}
          <span className="font-mono text-xs opacity-80">{tournamentId}</span>
        </p>
      ) : null}
    </div>
  );
}
