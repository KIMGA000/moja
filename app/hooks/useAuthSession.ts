"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export function getNickname(session: Session): string {
  const metadata = session.user.user_metadata as Record<string, unknown>;
  return (
    (metadata.name as string | undefined) ??
    (metadata.nickname as string | undefined) ??
    (metadata.preferred_username as string | undefined) ??
    (metadata.full_name as string | undefined) ??
    "회원"
  );
}

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoaded(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return { session, loaded };
}
