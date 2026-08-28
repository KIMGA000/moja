"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CARD_STYLE, COLORS, pillBadge } from "../theme";
import {
  CATEGORY_LABEL,
  CATEGORY_OPTIONS,
  formatRelativeTime,
  type Category,
  type Post,
} from "../data/community";
import { useAuthSession } from "../hooks/useAuthSession";

type Filter = "all" | Category;

export default function CommunityPage() {
  const { session } = useAuthSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/posts?category=${filter}`)
      .then((res) => res.json())
      .then((data) => setPosts(data.posts ?? []))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.pageBg }}>
      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "28px 20px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <Link href="/" style={{ fontSize: "14px", fontWeight: 700, color: COLORS.onDarkMuted, textDecoration: "none" }}>
            ← 처음으로
          </Link>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {session && (
              <Link
                href="/community/mine"
                style={{ fontSize: "13px", fontWeight: 700, color: COLORS.onDarkMuted, textDecoration: "none" }}
              >
                내 활동
              </Link>
            )}
            <Link
              href="/community/write"
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#ffffff",
                background: COLORS.ink,
                padding: "10px 18px",
                borderRadius: "999px",
                textDecoration: "none",
              }}
            >
              ✏️ 글쓰기
            </Link>
          </div>
        </div>

        <header style={{ marginBottom: "20px" }}>
          <span style={pillBadge("lime")}>커뮤니티</span>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: COLORS.onDark, marginTop: "12px" }}>
            같은 처지의 이야기
          </h1>
          <p style={{ fontSize: "13px", color: COLORS.onDarkMuted, marginTop: "6px" }}>
            둘러보는 건 누구나 자유롭게, 글쓰기·댓글은 로그인 후에 할 수 있어요.
          </p>
        </header>

        <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "20px" }}>
          {(["all", ...CATEGORY_OPTIONS] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flexShrink: 0,
                padding: "10px 18px",
                borderRadius: "999px",
                border: `1.5px solid ${filter === f ? COLORS.ink : COLORS.cardBorder}`,
                background: filter === f ? COLORS.ink : "#ffffff",
                color: filter === f ? "#ffffff" : COLORS.inkMuted,
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {f === "all" ? "전체" : CATEGORY_LABEL[f]}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading && <p style={{ fontSize: "14px", color: COLORS.onDarkMuted }}>불러오는 중...</p>}

          {!loading && posts.length === 0 && (
            <section style={CARD_STYLE}>
              <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>아직 글이 없어요. 첫 글을 남겨보세요.</p>
            </section>
          )}

          {posts.map((post) => (
            <Link key={post.id} href={`/community/${post.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <section style={CARD_STYLE}>
                <span style={pillBadge("violet")}>{CATEGORY_LABEL[post.category]}</span>
                <p style={{ fontSize: "16px", fontWeight: 800, color: COLORS.ink, marginTop: "10px" }}>{post.title}</p>
                <p
                  style={{
                    fontSize: "13px",
                    color: COLORS.inkMuted,
                    marginTop: "6px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {post.body}
                </p>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px", fontSize: "12px", color: COLORS.onDarkFaint, alignItems: "center" }}>
                  <span>{post.author}</span>
                  {post.badge && <span>· {post.badge}</span>}
                  <span>· {formatRelativeTime(post.createdAt)}</span>
                  <span>· 댓글 {post.commentCount}</span>
                </div>
              </section>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
