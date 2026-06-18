import { Link, Outlet, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { useTournamentId } from "@/hooks/useTournamentId";
import { buildLiveViewHref } from "@/lib/viewerDisplay";

export function Layout() {
  const { pathname } = useLocation();
  const [tournamentId] = useTournamentId();
  const liveViewHref = useMemo(
    () => buildLiveViewHref(tournamentId, "G1"),
    [tournamentId]
  );
  const home = pathname === "/" || pathname === "/interschool";
  /** Single-team fan page: same stage background as live view for visual continuity. */
  const teamViewerArena =
    pathname.startsWith("/t/") && pathname.includes("/team/");

  return (
    <div className="min-h-screen flex flex-col">
      {!home ? (
        <header className="border-b border-cup-line bg-cup-ink text-cup-paper">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <Link to={liveViewHref} className="font-display font-semibold text-lg tracking-tight">
              Felice Roboccia Cup
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link to={liveViewHref} className="hover:underline opacity-90">
                Live
              </Link>
            </nav>
          </div>
        </header>
      ) : null}
      <main
        className={
          home
            ? "flex-1 mx-auto w-full max-w-screen-2xl bg-cup-stage px-4 py-5 md:px-6"
            : teamViewerArena
              ? "flex-1 mx-auto w-full max-w-3xl bg-cup-stage px-4 py-8 md:px-6 md:py-10"
              : "flex-1 max-w-6xl mx-auto w-full px-4 py-8"
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
