"use client";

import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { getNickname, useAuthSession } from "../hooks/useAuthSession";
import { COLORS } from "../theme";

// 신원인증(진짜 자립준비청년인지)은 아직 없다. 카카오 로그인은 "이 저장된 데이터가
// 같은 사람 것"임을 보장하는 최소 계정 계층일 뿐 — profiles 테이블 upsert도 그 목적.
async function syncProfile(session: Session) {
  if (!supabase) return;
  await supabase
    .from("profiles")
    .upsert(
      { id: session.user.id, nickname: getNickname(session), updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
}

export function AuthBar() {
  const { session, loaded } = useAuthSession();

  useEffect(() => {
    if (session) syncProfile(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  if (!supabase || !loaded) return null;
  const client = supabase;

  if (!session) {
    return (
      <button
        onClick={() =>
          client.auth.signInWithOAuth({
            provider: "kakao",
            options: { redirectTo: window.location.origin },
          })
        }
        style={{
          background: "#FEE500",
          border: "none",
          borderRadius: "999px",
          padding: "6px 14px",
          fontSize: "13px",
          fontWeight: 700,
          color: "#191919",
        }}
      >
        카카오로 로그인
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ fontSize: "13px", fontWeight: 700, color: COLORS.onDark }}>{getNickname(session)}님</span>
      <button
        onClick={() => client.auth.signOut()}
        style={{
          background: "none",
          border: "none",
          fontSize: "13px",
          fontWeight: 700,
          color: COLORS.onDarkMuted,
        }}
      >
        로그아웃
      </button>
    </div>
  );
}
