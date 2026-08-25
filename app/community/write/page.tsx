"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CARD_STYLE, COLORS, PRIMARY_BUTTON, PRIMARY_BUTTON_DISABLED, inputStyle } from "../../theme";
import { CATEGORY_LABEL, CATEGORY_OPTIONS, getOrCreateNickname, type Category } from "../../data/community";
import {
  COMMUNITY_PROFILE_STORAGE_KEY,
  describeProtectionTiming,
  type CommunityProfile,
} from "../../data/communityProfile";
import { useAuthSession, getNickname } from "../../hooks/useAuthSession";
import { createPostAsUser } from "../../../lib/communityClient";
import { supabase } from "../../../lib/supabase";

export default function WritePostPage() {
  const router = useRouter();
  const { session, loaded } = useAuthSession();
  const [category, setCategory] = useState<Category>("free");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState("");
  const [postAsSelf, setPostAsSelf] = useState(false);

  useEffect(() => {
    setNickname(getOrCreateNickname());
  }, []);

  const canSubmit = title.trim() !== "" && body.trim() !== "" && !submitting;
  const displayName = session && postAsSelf ? getNickname(session) : nickname;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    let badge: string | null = null;
    const savedProfile = localStorage.getItem(COMMUNITY_PROFILE_STORAGE_KEY);
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile) as CommunityProfile;
        badge = describeProtectionTiming(profile.protectionEndYearMonth) || null;
      } catch {
        badge = null;
      }
    }

    try {
      // 글쓰기는 로그인해야만 가능 — 브라우저에서 바로 써야 user_id(auth.uid())가 자동으로
      // 붙어서, "익명"으로 표시해도 나중에 본인이 수정·삭제할 수 있다.
      const post = await createPostAsUser({ category, title, body, author: displayName, badge });
      router.push(`/community/${post.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.pageBg }}>
      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "28px 20px 80px" }}>
        <Link
          href="/community"
          style={{
            display: "inline-block",
            fontSize: "14px",
            fontWeight: 700,
            color: COLORS.onDarkMuted,
            textDecoration: "none",
            marginBottom: "20px",
          }}
        >
          ← 커뮤니티로
        </Link>

        <h1 style={{ fontSize: "22px", fontWeight: 800, color: COLORS.onDark, marginBottom: "6px" }}>글쓰기</h1>

        {loaded && !session ? (
          <section style={{ ...CARD_STYLE, textAlign: "center", padding: "32px 20px" }}>
            <p style={{ fontSize: "14px", color: COLORS.inkMuted, marginBottom: "16px" }}>
              글쓰기는 로그인 후에 이용할 수 있어요.
            </p>
            <button
              onClick={() =>
                supabase?.auth.signInWithOAuth({
                  provider: "kakao",
                  options: { redirectTo: window.location.origin + "/community/write" },
                })
              }
              style={{
                background: "#FEE500",
                border: "none",
                borderRadius: "999px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 700,
                color: "#191919",
              }}
            >
              카카오로 로그인
            </button>
          </section>
        ) : (
          <>
            <p style={{ fontSize: "13px", color: COLORS.onDarkMuted, marginBottom: session ? "12px" : "24px" }}>
              {displayName ? `"${displayName}"으로 게시돼요.` : ""}
            </p>

            {session && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
                <button
                  onClick={() => setPostAsSelf(false)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "999px",
                    border: `1.5px solid ${!postAsSelf ? COLORS.ink : COLORS.cardBorder}`,
                    background: !postAsSelf ? COLORS.ink : "#ffffff",
                    color: !postAsSelf ? "#ffffff" : COLORS.inkMuted,
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  익명으로 쓰기
                </button>
                <button
                  onClick={() => setPostAsSelf(true)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "999px",
                    border: `1.5px solid ${postAsSelf ? COLORS.ink : COLORS.cardBorder}`,
                    background: postAsSelf ? COLORS.ink : "#ffffff",
                    color: postAsSelf ? "#ffffff" : COLORS.inkMuted,
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {getNickname(session)}(으)로 쓰기
                </button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 700, color: COLORS.onDark, marginBottom: "10px" }}>카테고리</h2>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {CATEGORY_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: "999px",
                        border: `1.5px solid ${category === c ? COLORS.ink : COLORS.cardBorder}`,
                        background: category === c ? COLORS.ink : "#ffffff",
                        color: category === c ? "#ffffff" : COLORS.inkMuted,
                        fontSize: "13px",
                        fontWeight: 700,
                      }}
                    >
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" style={inputStyle} />

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="내용을 적어주세요"
                rows={10}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />

              <button onClick={handleSubmit} disabled={!canSubmit} style={canSubmit ? PRIMARY_BUTTON : PRIMARY_BUTTON_DISABLED}>
                {submitting ? "게시 중..." : "게시하기"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
