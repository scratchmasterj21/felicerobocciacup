import { regulationTotals } from "./roundRobin";
import { regulationWinner } from "./finalMatch";
import type { FinalMatchData } from "./types";

export type BracketCardAccent =
  | "scheduled"
  | "regulation"
  | "extra"
  | "suddenDeath"
  | "completed";

export interface BracketMatchDisplay {
  phaseLabel: string;
  scoreSummary?: string;
  subline?: string;
  accent: BracketCardAccent;
}

function summarizeRegulation(match: FinalMatchData): string | undefined {
  if (!match.regulation) return undefined;
  const totals = regulationTotals(match.regulation);
  return `${totals.totalA}-${totals.totalB}`;
}

function summarizeExtra(match: FinalMatchData): string | undefined {
  const round = match.extra8min?.round;
  if (!round) return undefined;
  return `${round.scoreA}-${round.scoreB}`;
}

export function getBracketMatchDisplay(match: FinalMatchData): BracketMatchDisplay {
  const reg = summarizeRegulation(match);
  const extra = summarizeExtra(match);
  const sd = match.suddenDeath;
  const cyclesPlayed = sd ? Object.keys(sd.cycles ?? {}).length : 0;
  const cycleOrdinal = sd ? Math.max(1, sd.cycleIndex + 1) : 1;

  // Auto-advanced bye (no score context to show).
  if (
    match.status === "COMPLETED" &&
    match.winnerTeamId &&
    !match.regulation &&
    !match.extra8min &&
    !match.suddenDeath
  ) {
    return { phaseLabel: "Bye", accent: "completed" };
  }

  if (sd?.status === "IN_PROGRESS") {
    const scoreSummary =
      reg && extra ? `Reg ${reg}, Ex ${extra}` : reg ? `Reg ${reg}` : undefined;
    const phaseLabel = `SD C${cycleOrdinal}`;
    return {
      phaseLabel,
      scoreSummary,
      subline: scoreSummary ? `${phaseLabel} · ${scoreSummary}` : phaseLabel,
      accent: "suddenDeath",
    };
  }

  if (match.status === "COMPLETED" && match.winnerTeamId) {
    const fromSuddenDeath = Boolean(sd);
    const fromExtra = !fromSuddenDeath && Boolean(extra);
    const phaseLabel = fromSuddenDeath
      ? `Final (SD x${Math.max(1, cyclesPlayed)})`
      : fromExtra
        ? "Final (Ex)"
        : "Final";
    const scoreSummary =
      reg && extra ? `${reg} (+Ex ${extra})` : reg ? reg : extra ? `Ex ${extra}` : undefined;
    return {
      phaseLabel,
      scoreSummary,
      subline: scoreSummary ? `${phaseLabel} · ${scoreSummary}` : phaseLabel,
      accent: "completed",
    };
  }

  if (match.extra8min?.status === "IN_PROGRESS") {
    const phaseLabel = "Extra";
    const scoreSummary = reg ? `Reg ${reg}` : undefined;
    return {
      phaseLabel,
      scoreSummary,
      subline: scoreSummary ? `${phaseLabel} · ${scoreSummary}` : phaseLabel,
      accent: "extra",
    };
  }

  if (match.extra8min?.status === "COMPLETED" && match.extra8min.tiedAfterExtra) {
    const phaseLabel = "Sudden death";
    const scoreSummary =
      reg && extra ? `Reg ${reg}, Ex ${extra}` : reg ? `Reg ${reg}` : undefined;
    return {
      phaseLabel,
      scoreSummary,
      subline: scoreSummary ? `${phaseLabel} · ${scoreSummary}` : phaseLabel,
      accent: "suddenDeath",
    };
  }

  if (match.regulation) {
    const phaseLabel = regulationWinner(match.regulation) === "tie" ? "Reg tied" : "Reg";
    return {
      phaseLabel,
      scoreSummary: reg,
      subline: reg ? `${phaseLabel} · ${reg}` : phaseLabel,
      accent: "regulation",
    };
  }

  return { phaseLabel: "Scheduled", accent: "scheduled" };
}
