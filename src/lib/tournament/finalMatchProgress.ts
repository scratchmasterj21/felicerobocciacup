import type { FinalMatchData } from "@/lib/tournament/types";

/** True when a finals match has been started or completed (any period scored). */
export function finalMatchHasScores(m: FinalMatchData): boolean {
  return (
    m.status === "COMPLETED" ||
    m.status === "IN_PROGRESS" ||
    Boolean(m.regulation || m.extra8min || m.suddenDeath)
  );
}

/** Prefer prior Japan Cup challenge when regenerate would wipe in-progress scores. */
export function pickJapanCupChallengeOnRegenerate(
  prior: FinalMatchData | undefined,
  rebuilt: FinalMatchData
): FinalMatchData {
  if (
    prior &&
    prior.id === rebuilt.id &&
    finalMatchHasScores(prior)
  ) {
    return prior;
  }
  return rebuilt;
}
