import { useMemo, useState } from "react";

const KEY = "felice_roboccia_tournament_id";

export function readStoredTournamentId(): string {
  const envDefault = import.meta.env.VITE_DEFAULT_TOURNAMENT_ID ?? "";
  try {
    return localStorage.getItem(KEY) || envDefault || "cup2026";
  } catch {
    return envDefault || "cup2026";
  }
}

export function useTournamentId(): [string, (id: string) => void] {
  const [id, setIdState] = useState(readStoredTournamentId);

  const setId = useMemo(
    () => (next: string) => {
      setIdState(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignore */
      }
    },
    []
  );

  return [id, setId];
}
