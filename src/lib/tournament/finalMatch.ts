import type {
  Closer,
  ExtraEightState,
  FinalMatchData,
  RegulationScores,
  SuddenDeathState,
} from "./types";
import { regulationTotals } from "./roundRobin";

export function regulationWinner(
  reg: RegulationScores
): "A" | "B" | "tie" {
  const { totalA, totalB } = regulationTotals(reg);
  if (totalA > totalB) return "A";
  if (totalB > totalA) return "B";
  return "tie";
}

export function extraEightWinner(
  round: { scoreA: number; scoreB: number }
): "A" | "B" | "tie" {
  if (round.scoreA > round.scoreB) return "A";
  if (round.scoreB > round.scoreA) return "B";
  return "tie";
}

export function applyRegulationComplete(
  match: FinalMatchData,
  regulation: RegulationScores
): FinalMatchData {
  const w = regulationWinner(regulation);
  const next: FinalMatchData = {
    ...match,
    regulation,
    status: w === "tie" ? "IN_PROGRESS" : "COMPLETED",
  };
  if (w === "A" && match.teamAId) {
    next.winnerTeamId = match.teamAId;
  } else if (w === "B" && match.teamBId) {
    next.winnerTeamId = match.teamBId;
  }
  return next;
}

export function applyExtraEightComplete(
  match: FinalMatchData,
  round: { scoreA: number; scoreB: number }
): FinalMatchData {
  const extra8min: ExtraEightState = {
    status: "COMPLETED",
    round,
    tiedAfterExtra: extraEightWinner(round) === "tie",
  };
  const w = extraEightWinner(round);
  const next: FinalMatchData = { ...match, extra8min };
  if (w === "A" && match.teamAId) {
    return { ...next, status: "COMPLETED", winnerTeamId: match.teamAId };
  }
  if (w === "B" && match.teamBId) {
    return { ...next, status: "COMPLETED", winnerTeamId: match.teamBId };
  }
  const sd: SuddenDeathState = {
    status: "IN_PROGRESS",
    cycleIndex: 0,
    cycles: {},
  };
  return {
    ...next,
    status: "IN_PROGRESS",
    suddenDeath: sd,
  };
}

export function applySuddenDeathCloser(
  match: FinalMatchData,
  closer: Closer
): FinalMatchData {
  const sd = match.suddenDeath;
  if (!sd || sd.status === "COMPLETED") return match;
  const idx = sd.cycleIndex;
  const cycles = { ...(sd.cycles ?? {}) };
  cycles[String(idx)] = { closer };
  let winnerTeamId = match.winnerTeamId;
  let cycleIndex = idx;
  let status: FinalMatchData["status"] = match.status;
  if (closer === "A" && match.teamAId) {
    winnerTeamId = match.teamAId;
    status = "COMPLETED";
  } else if (closer === "B" && match.teamBId) {
    winnerTeamId = match.teamBId;
    status = "COMPLETED";
  } else if (closer === "TIE") {
    cycleIndex = idx + 1;
  }
  const suddenDeath: SuddenDeathState = {
    ...sd,
    cycles,
    cycleIndex,
    status: winnerTeamId ? "COMPLETED" : "IN_PROGRESS",
  };
  return { ...match, suddenDeath, winnerTeamId, status };
}
