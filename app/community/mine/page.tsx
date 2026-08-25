"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CARD_STYLE, COLORS, pillBadge } from "../../theme";
import { CATEGORY_LABEL, formatRelativeTime, type Comment, type Post } from "../../data/community";
import { useAuthSession } from "../../hooks/useAuthSession";
import { listMyComments, listMyPosts } from "../../../lib/communityClient";

export default function MyActivityPage() {
  const { session, loaded } = useAuthSession();
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<(Comment & { postTitle: string | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([listMyPosts(session.user.id), listMyComments(session.user.id)])
      .then(([p, c]) => {
        setPosts(p);
        setComments(c);
      })
      .finally(() => setLoading(false));
  }, [session]);

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

        <header style={{ marginBottom: "20px" }}>
          <span style={pillBadge("lime")}>내 활동</span>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: COLORS.onDark, marginTop: "12px" }}>
            내가 쓴 글·댓글
          </h1>
        </header>

        {loaded && !session && (
          <section style={CARD_STYLE}>
            <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>
              로그인해야 내가 쓴 글과 댓글을 모아볼 수 있어요. 헤더에서 카카오로 로그인해주세요.
            </p>
          </section>
        )}

        {session && (
          <>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button onClick={() => setTab("posts")} style={tabStyle(tab === "posts")}>
                내 글 ({posts.length})
              </button>
              <button onClick={() => setTab("comments")} style={tabStyle(tab === "comments")}>
                내 댓글 ({comments.length})
              </button>
            </div>

            {loading && <p style={{ fontSize: "14px", color: COLORS.onDarkMuted }}>불러오는 중...</p>}

            {!loading && tab === "posts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {posts.length === 0 && (
                  <section style={CARD_STYLE}>
                    <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>아직 쓴 글이 없어요.</p>
                  </section>
                )}
                {posts.map((post) => (
                  <Link key={post.id} href={`/community/${post.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <section style={CARD_STYLE}>
                      <span style={pillBadge("violet")}>{CATEGORY_LABEL[post.category]}</span>
                      <p style={{ fontSize: "16px", fontWeight: 800, color: COLORS.ink, marginTop: "10px" }}>
                        {post.title}
                      </p>
                      <p style={{ fontSize: "12px", color: COLORS.onDarkFaint, marginTop: "8px" }}>
                        {formatRelativeTime(post.createdAt)} · 댓글 {post.commentCount}
                      </p>
                    </section>
                  </Link>
                ))}
              </div>
            )}

            {!loading && tab === "comments" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {comments.length === 0 && (
                  <section style={CARD_STYLE}>
                    <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>아직 쓴 댓글이 없어요.</p>
                  </section>
                )}
                {comments.map((c) => (
                  <Link key={c.id} href={`/community/${c.postId}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <section style={CARD_STYLE}>
                      <p style={{ fontSize: "12px", color: COLORS.onDarkFaint }}>{c.postTitle ?? "(삭제된 글)"}</p>
                      <p style={{ fontSize: "14px", color: "#3f3f46", marginTop: "6px" }}>{c.body}</p>
                      <p style={{ fontSize: "12px", color: COLORS.onDarkFaint, marginTop: "8px" }}>
                        {formatRelativeTime(c.createdAt)}
                      </p>
                    </section>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function tabStyle(active: boolean) {
  return {
    padding: "10px 16px",
    borderRadius: "999px",
    border: `1.5px solid ${active ? COLORS.ink : COLORS.cardBorder}`,
    background: active ? COLORS.ink : "#ffffff",
    color: active ? "#ffffff" : COLORS.inkMuted,
    fontSize: "13px",
    fontWeight: 700,
  } as const;
}
