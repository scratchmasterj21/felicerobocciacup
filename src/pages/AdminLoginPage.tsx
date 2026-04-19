import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/config";
import { ADMIN_APP_BASE_PATH, DEFAULT_ADMIN_EMAIL } from "@/lib/auth/admin";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? ADMIN_APP_BASE_PATH;

  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithPopup(auth, googleProvider);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="font-display text-2xl font-semibold">Admin sign in</h1>
      <p className="text-sm text-cup-muted">
        Use your Felice Google account. The default super-admin is{" "}
        <code className="bg-cup-line/40 px-1 rounded break-all">{DEFAULT_ADMIN_EMAIL}</code>
        . Others need their UID under{" "}
        <code className="bg-cup-line/40 px-1 rounded">config/adminUids</code> and
        matching rules—see{" "}
        <code className="bg-cup-line/40 px-1 rounded">database.rules.json</code>.
      </p>
      <p className="text-xs text-cup-muted">
        In Firebase Console → Authentication → Sign-in method, enable{" "}
        <strong>Google</strong>, and add your dev domain (e.g.{" "}
        <code className="bg-cup-line/30 px-1 rounded">localhost</code>) to authorized
        domains if needed.
      </p>
      <div className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-4">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void signInWithGoogle()}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-cup-line bg-white text-cup-ink font-medium shadow-sm hover:bg-cup-paper disabled:opacity-50"
        >
          <GoogleIcon />
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
      </div>
      <p className="text-sm text-center">
        <Link to="/" className="text-cup-accent underline">
          Back to live view
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
