import { Navigate, useLocation, Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import { useAdminGate } from "@/hooks/useAdminGate";
import { getFirebaseAuth } from "@/lib/firebase/config";
import { ADMIN_APP_LOGIN_PATH, DEFAULT_ADMIN_EMAIL } from "@/lib/auth/admin";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { loading: adminLoading, isAdmin } = useAdminGate(user);
  const location = useLocation();

  if (authLoading || (user && adminLoading)) {
    return (
      <p className="text-cup-muted py-8 text-center" role="status">
        Loading…
      </p>
    );
  }

  if (!user) {
    return (
      <Navigate to={ADMIN_APP_LOGIN_PATH} replace state={{ from: location.pathname }} />
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto space-y-4 text-center py-12">
        <h1 className="font-display text-xl font-semibold">Not an admin</h1>
        <p className="text-sm text-cup-muted">
          Signed in as <strong>{user.email ?? user.uid}</strong>. Admins are
          the default Google account{" "}
          <code className="bg-cup-line/40 px-1 rounded break-all">{DEFAULT_ADMIN_EMAIL}</code>{" "}
          or accounts whose Firebase UID is set to{" "}
          <code className="bg-cup-line/40 px-1 rounded">true</code> under{" "}
          <code className="bg-cup-line/40 px-1 rounded">config/adminUids/{"{uid}"}</code>{" "}
          in the Realtime Database (see{" "}
          <code className="bg-cup-line/40 px-1 rounded">database.rules.json</code>
          ).
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-cup-ink text-cup-paper text-sm font-medium"
            onClick={() => void signOut(getFirebaseAuth())}
          >
            Sign out
          </button>
          <Link
            to="/"
            className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white"
          >
            Live view
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
