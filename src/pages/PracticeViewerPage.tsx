import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTournamentId } from "@/hooks/useTournamentId";
import {
  subscribePracticeMatches,
  subscribeTeams,
  subscribeTournamentMeta,
} from "@/lib/firebase/tournamentService";
import type { PracticeMatchData } from "@/lib/tournament/types";
import { rankStandings } from "@/lib/tournament/standings";
import { practiceMatchesToQualifying } from "@/lib/tournament/practice";
import { regulationTotals } from "@/lib/tournament/roundRobin";
import { StandingsTable } from "@/components/StandingsTable";

const LIVE_FALLBACK_LOGO_SRC = "https://i.imgur.com/RpJzD9D.png";

type TeamLite = { gradeId: string; divisionId: "A" | "B"; name: string };

export function PracticeViewerPage() {
  const [searchParams] = useSearchParams();
  const [tournamentId, setTournamentId] = useTournamentId();
  const [meta, setMeta] = useState<{ name?: string; schoolYear?: number } | null>(
    null
  );
  const [teams, setTeams] = useState<Record<string, TeamLite> | null>(null);
  const [practiceMatches, setPracticeMatches] = useState<Record<
    string,
    PracticeMatchData
  > | null>(null);

  useEffect(() => {
    const tid = searchParams.get("tournamentId");
    if (tid) setTournamentId(tid);
  }, [searchParams, setTournamentId]);

  useEffect(() => {
    return subscribeTournamentMeta(tournamentId, (m) => setMeta(m));
  }, [tournamentId]);
  useEffect(() => {
    return subscribeTeams(tournamentId, (t) =>
      setTeams(t as Record<string, TeamLite> | null)
    );
  }, [tournamentId]);
  useEffect(() => {
    return subscribePracticeMatches(tournamentId, setPracticeMatches);
  }, [tournamentId]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, t] of Object.entries(teams ?? {})) m.set(id, t.name);
    return m;
  }, [teams]);

  /** Classes (gradeId+divisionId) that have at least one practice match, sorted. */
  const classes = useMemo(() => {
    const byClass = new Map<string, PracticeMatchData[]>();
    for (const m of Object.values(practiceMatches ?? {})) {
      const key = `${m.gradeId}${m.divisionId}`;
      const arr = byClass.get(key) ?? [];
      arr.push(m);
      byClass.set(key, arr);
    }
    const out: Array<{
      key: string;
      gradeId: string;
      divisionId: "A" | "B";
      matches: PracticeMatchData[];
      teamIds: string[];
    }> = [];
    for (const [key, matches] of byClass.entries()) {
      matches.sort((a, b) => a.order - b.order);
      const gradeId = matches[0]?.gradeId ?? "";
      const divisionId = matches[0]?.divisionId ?? "A";
      const teamIds = Array.from(
        new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]))
      );
      out.push({ key, gradeId, divisionId, matches, teamIds });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }, [practiceMatches]);

  const h2Section =
    "font-displayWide text-2xl md:text-3xl font-semibold mb-3 text-slate-50 border-l-4 border-cup-signal pl-3 tracking-wide";
  const h3 =
    "text-sm md:text-base font-semibold text-cup-signalMuted mb-2 tracking-wide";

  return (
    <div className="projection-shell space-y-10 rounded-2xl px-2 py-3 md:px-4 md:py-5">
      <header className="text-center border-b border-cup-stageBorder pb-6 mb-2">
        <h1 className="font-display text-3xl md:text-5xl font-semibold text-slate-50 tracking-tight flex justify-center">
          {meta?.name?.trim() ? (
            meta.name.trim()
          ) : (
            <img
              src={LIVE_FALLBACK_LOGO_SRC}
              alt="Practice matches"
              className="max-h-[min(22vh,200px)] w-auto object-contain mx-auto"
              decoding="async"
            />
          )}
        </h1>
        <p className="font-displayWide text-cup-signal text-xl md:text-3xl mt-3 font-semibold tracking-wide">
          Practice matches
        </p>
        {meta && Number.isFinite(Number(meta.schoolYear)) ? (
          <p className="text-slate-400 text-lg mt-1 tabular-nums">
            {meta.schoolYear}
          </p>
        ) : null}
      </header>

      {classes.length === 0 ? (
        <p className="text-base text-slate-400 max-w-2xl">
          No practice matches yet.
        </p>
      ) : (
        <div className="space-y-12">
          {classes.map((c) => (
            <PracticeClassBlock
              key={c.key}
              classLabel={c.key}
              matches={c.matches}
              teamIds={c.teamIds}
              nameById={nameById}
              h2Section={h2Section}
              h3={h3}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PracticeClassBlock({
  classLabel,
  matches,
  teamIds,
  nameById,
  h2Section,
  h3,
}: {
  classLabel: string;
  matches: PracticeMatchData[];
  teamIds: string[];
  nameById: Map<string, string>;
  h2Section: string;
  h3: string;
}) {
  const standings = useMemo(
    () => rankStandings(teamIds, practiceMatchesToQualifying(matches)),
    [matches, teamIds]
  );

  return (
    <section>
      <h2 className={h2Section}>{classLabel}</h2>
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="min-w-0">
          <h3 className={h3}>Ranking</h3>
          <StandingsTable
            standings={standings}
            nameById={nameById}
            projectionMode
          />
        </div>
        <div className="min-w-0">
          <h3 className={h3}>Matches</h3>
          <ol className="space-y-2">
            {matches.map((m, idx) => {
              const teamA = nameById.get(m.teamAId) ?? m.teamAId;
              const teamB = nameById.get(m.teamBId) ?? m.teamBId;
              const done = m.status === "COMPLETED" && m.regulation;
              const totals = m.regulation
                ? regulationTotals(m.regulation)
                : null;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-cup-stageBorder bg-cup-stageElevated/60 px-3 py-2 text-slate-100"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-slate-400 shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="truncate">
                      {teamA} <span className="text-slate-500">vs</span> {teamB}
                    </span>
                  </span>
                  {done && totals ? (
                    <span className="font-semibold tabular-nums text-cup-signal shrink-0">
                      {totals.totalA}-{totals.totalB}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 shrink-0">
                      scheduled
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
