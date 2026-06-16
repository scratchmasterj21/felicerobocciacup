import type { FinalMatchData } from "@/lib/tournament/types";
import { getBracketMatchDisplay } from "@/lib/tournament/bracketMatchDisplay";
import { formatScheduleTokyo } from "@/lib/schedule/tokyo";

export function JapanCupChallengeMatchup({
  match,
  nameById,
  championName,
  projectionMode,
}: {
  match: FinalMatchData;
  nameById: Map<string, string>;
  /** Fallback when the dedicated JC team name is not in the map yet. */
  championName?: string;
  projectionMode?: boolean;
}) {
  const p = Boolean(projectionMode);
  const label = (tid?: string, fallback?: string) => {
    if (tid) return nameById.get(tid) ?? fallback ?? tid;
    return fallback ?? "TBD";
  };
  const display = getBracketMatchDisplay(match);
  const aWinner = match.winnerTeamId && match.winnerTeamId === match.teamAId;
  const bWinner = match.winnerTeamId && match.winnerTeamId === match.teamBId;
  const teamA = label(match.teamAId, "Grade champion TBD");
  const teamB = label(match.teamBId, championName ?? "Japan Cup champion");
  const barClass =
    display.accent === "completed"
      ? "bg-cup-signal"
      : display.accent === "suddenDeath"
        ? "bg-amber-400"
        : display.accent === "extra"
          ? "bg-amber-300"
          : display.accent === "regulation"
            ? "bg-sky-400"
            : "bg-amber-500";

  return (
    <div
      className={
        p
          ? "rounded-2xl border-2 border-amber-400/70 bg-cup-stageElevated/95 shadow-xl shadow-black/40 overflow-hidden"
          : "rounded-xl border border-amber-500/50 bg-cup-paper/60 overflow-hidden"
      }
    >
      <div className={`h-1.5 ${barClass}`} />
      <div className={p ? "px-6 py-5 md:px-8 md:py-6" : "px-4 py-4"}>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
          <span className="text-2xl leading-none" aria-hidden>
            🏆
          </span>
          <h3
            className={
              p
                ? "font-displayWide text-xl md:text-2xl font-semibold text-amber-300 tracking-wide uppercase"
                : "font-display text-base font-semibold text-[#8a6b00] tracking-wide uppercase"
            }
          >
            Japan Cup challenge — true grade champion
          </h3>
        </div>
        <div
          className={
            p
              ? "grid md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-center text-center"
              : "grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-center text-center"
          }
        >
          <div
            className={
              p
                ? `rounded-xl border px-4 py-5 md:px-6 md:py-6 ${
                    aWinner
                      ? "border-cup-signal bg-cup-signal/10"
                      : "border-cup-stageBorder bg-cup-stage/80"
                  }`
                : `rounded-lg border px-3 py-3 ${
                    aWinner ? "border-cup-accent bg-cup-paper" : "border-cup-line bg-white"
                  }`
            }
          >
            <div
              className={
                p
                  ? "text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-2"
                  : "text-[10px] uppercase tracking-wide text-cup-muted mb-1"
              }
            >
              Grade champion
            </div>
            <div
              className={
                p
                  ? `font-display text-2xl md:text-4xl font-semibold leading-tight ${
                      aWinner ? "text-cup-signal" : "text-slate-50"
                    }`
                  : `font-display text-lg font-semibold ${aWinner ? "text-cup-accent" : ""}`
              }
            >
              {teamA}
            </div>
          </div>
          <div
            className={
              p
                ? "font-displayWide text-2xl md:text-3xl font-bold text-amber-300/90 tabular-nums"
                : "text-lg font-bold text-cup-muted"
            }
          >
            VS
          </div>
          <div
            className={
              p
                ? `rounded-xl border px-4 py-5 md:px-6 md:py-6 ${
                    bWinner
                      ? "border-cup-signal bg-cup-signal/10"
                      : "border-cup-stageBorder bg-cup-stage/80"
                  }`
                : `rounded-lg border px-3 py-3 ${
                    bWinner ? "border-cup-accent bg-cup-paper" : "border-cup-line bg-white"
                  }`
            }
          >
            <div
              className={
                p
                  ? "text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-2"
                  : "text-[10px] uppercase tracking-wide text-cup-muted mb-1"
              }
            >
              Japan Cup champion
            </div>
            <div
              className={
                p
                  ? `font-display text-2xl md:text-4xl font-semibold leading-tight ${
                      bWinner ? "text-cup-signal" : "text-slate-50"
                    }`
                  : `font-display text-lg font-semibold ${bWinner ? "text-cup-accent" : ""}`
              }
            >
              {teamB}
            </div>
          </div>
        </div>
        {display.subline || match.schedule?.startAt != null ? (
          <p
            className={
              p
                ? "text-center text-sm md:text-base text-slate-400 mt-5"
                : "text-center text-xs text-cup-muted mt-3"
            }
          >
            {match.schedule?.startAt != null
              ? formatScheduleTokyo(match.schedule.startAt, {
                  durationRegulationMinutes: match.schedule.durationRegulationMinutes,
                  court: match.schedule.court,
                  finalsHint: true,
                })
              : display.subline}
          </p>
        ) : match.status !== "COMPLETED" ? (
          <p
            className={
              p
                ? "text-center text-sm md:text-base text-slate-500 mt-5"
                : "text-center text-xs text-cup-muted mt-3"
            }
          >
            16 min regulation + 8 min extra if tied
          </p>
        ) : null}
        {match.status === "COMPLETED" && match.winnerTeamId ? (
          <p
            className={
              p
                ? "text-center font-display text-xl md:text-2xl text-cup-signal mt-4"
                : "text-center font-medium text-cup-win mt-2"
            }
          >
            True grade champion: {label(match.winnerTeamId, championName)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
