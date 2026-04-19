import { useMemo, useState } from "react";

const KEY = "felice_roboccia_tournament_id";

export function useTournamentId(): [string, (id: string) => void] {
  const envDefault = import.meta.env.VITE_DEFAULT_TOURNAMENT_ID ?? "";
  const [id, setIdState] = useState(() => {
    try {
      return localStorage.getItem(KEY) || envDefault || "cup2026";
    } catch {
      return envDefault || "cup2026";
    }
  });

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
