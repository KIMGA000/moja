"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CARD_STYLE, COLORS, PRIMARY_BUTTON, PRIMARY_BUTTON_DISABLED, pillBadge } from "../../theme";
import {
  CATEGORY_LABEL,
  formatRelativeTime,
  getOrCreateNickname,
  type Comment,
  type Post,
} from "../../data/community";

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`/api/posts/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setPost(data.post);
        setComments(data.comments ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setNickname(getOrCreateNickname());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleComment = async () => {
    if (!commentBody.trim() || submitting) return;
    setSubmitting(true);
    await fetch(`/api/posts/${params.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: nickname, commentBody }),
    });
    setCommentBody("");
    setSubmitting(false);
    load();
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

        {loading && <p style={{ fontSize: "14px", color: COLORS.onDarkMuted }}>불러오는 중...</p>}

        {notFound && (
          <section style={CARD_STYLE}>
            <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>게시글을 찾을 수 없어요.</p>
          </section>
        )}

        {post && (
          <>
            <section style={CARD_STYLE}>
              <span style={pillBadge("violet")}>{CATEGORY_LABEL[post.category]}</span>
              <h1 style={{ fontSize: "20px", fontWeight: 800, color: COLORS.ink, marginTop: "12px" }}>{post.title}</h1>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", fontSize: "12px", color: COLORS.onDarkFaint }}>
                <span>{post.author}</span>
                {post.badge && <span>· {post.badge}</span>}
                <span>· {formatRelativeTime(post.createdAt)}</span>
              </div>
              <p style={{ fontSize: "15px", color: "#3f3f46", marginTop: "16px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {post.body}
              </p>
            </section>

            <h2 style={{ fontSize: "15px", fontWeight: 700, color: COLORS.onDark, margin: "24px 0 12px" }}>
              댓글 {comments.length}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {comments.length === 0 && (
                <p style={{ fontSize: "13px", color: COLORS.onDarkFaint }}>첫 댓글을 남겨보세요.</p>
              )}
              {comments.map((c) => (
                <section key={c.id} style={{ ...CARD_STYLE, padding: "16px" }}>
                  <div style={{ display: "flex", gap: "8px", fontSize: "12px", color: COLORS.onDarkFaint }}>
                    <span style={{ fontWeight: 700, color: COLORS.inkMuted }}>{c.author}</span>
                    <span>{formatRelativeTime(c.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: "14px", color: "#3f3f46", marginTop: "6px" }}>{c.body}</p>
                </section>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="댓글을 남겨보세요"
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: `1.5px solid ${COLORS.cardBorder}`,
                  fontSize: "14px",
                }}
              />
              <button
                onClick={handleComment}
                disabled={!commentBody.trim() || submitting}
                style={{
                  ...(commentBody.trim() ? PRIMARY_BUTTON : PRIMARY_BUTTON_DISABLED),
                  padding: "0 18px",
                  width: "auto",
                }}
              >
                등록
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
