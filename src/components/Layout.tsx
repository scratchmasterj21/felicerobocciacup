import { Link, Outlet, useLocation } from "react-router-dom";
import { parseViewerDisplayParams } from "@/lib/viewerDisplay";

export function Layout() {
  const { pathname, search } = useLocation();
  const home = pathname === "/";
  const { display, kiosk } = parseViewerDisplayParams(search);
  const wideLive = home && display;
  const hideHeader = home && kiosk;

  return (
    <div className="min-h-screen flex flex-col">
      {!hideHeader ? (
        <header className="border-b border-cup-line bg-cup-ink text-cup-paper">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <Link to="/" className="font-display font-semibold text-lg tracking-tight">
              Felice Roboccia Cup
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link to="/" className="hover:underline opacity-90">
                Live
              </Link>
            </nav>
          </div>
        </header>
      ) : null}
      <main
        className={
          wideLive
            ? hideHeader
              ? "flex-1 mx-auto w-full max-w-screen-2xl bg-cup-stage px-4 py-5 md:px-6"
              : "flex-1 mx-auto w-full max-w-screen-2xl bg-cup-stage px-4 py-8 md:px-6"
            : hideHeader
              ? "flex-1 max-w-6xl mx-auto w-full px-4 py-5"
              : "flex-1 max-w-6xl mx-auto w-full px-4 py-8"
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
