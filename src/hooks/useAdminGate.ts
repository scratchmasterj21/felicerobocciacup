import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { getDb } from "@/lib/firebase/config";
import { paths } from "@/lib/firebase/schema";
import { isAdminEmail } from "@/lib/auth/admin";
import type { User } from "firebase/auth";

/**
 * Whether the signed-in user may use the admin UI (matches RTDB write rules intent).
 */
export function useAdminGate(user: User | null): {
  loading: boolean;
  isAdmin: boolean;
} {
  const [uidListed, setUidListed] = useState<boolean | null>(null);

  useEffect(() => {
    setUidListed(null);
    if (!user) return;
    if (isAdminEmail(user.email)) return;

    const r = ref(getDb(), paths.adminUid(user.uid));
    return onValue(r, (snap) => {
      setUidListed(snap.val() === true);
    });
  }, [user]);

  if (!user) {
    return { loading: false, isAdmin: false };
  }

  if (isAdminEmail(user.email)) {
    return { loading: false, isAdmin: true };
  }

  if (uidListed === null) {
    return { loading: true, isAdmin: false };
  }

  return { loading: false, isAdmin: uidListed };
}
