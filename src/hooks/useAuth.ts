import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/config";
import { onAuthStateChanged } from "firebase/auth";

export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading };
}
