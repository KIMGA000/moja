"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CARD_STYLE, COLORS, PRIMARY_BUTTON, PRIMARY_BUTTON_DISABLED, pillBadge, inputStyle } from "../../theme";
import {
  CATEGORY_LABEL,
  formatRelativeTime,
  getOrCreateNickname,
  type Comment,
  type Post,
} from "../../data/community";
import { useAuthSession, getNickname } from "../../hooks/useAuthSession";
import { supabase } from "../../../lib/supabase";
import {
  addCommentAsUser,
  deleteComment,
  deletePost,
  updateComment,
  updatePost,
} from "../../../lib/communityClient";

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loaded } = useAuthSession();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState("");
  const [commentAsSelf, setCommentAsSelf] = useState(false);

  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");

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

  const commentAuthor = session && commentAsSelf ? getNickname(session) : nickname;

  const handleComment = async () => {
    if (!commentBody.trim() || submitting || !session) return;
    setSubmitting(true);
    try {
      await addCommentAsUser(params.id, { author: commentAuthor, body: commentBody.trim() });
      setCommentBody("");
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const startEditPost = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditingPost(true);
  };

  const saveEditPost = async () => {
    if (!post || !editTitle.trim() || !editBody.trim()) return;
    await updatePost(post.id, { title: editTitle.trim(), body: editBody.trim() });
    setEditingPost(false);
    load();
  };

  const removePost = async () => {
    if (!post) return;
    if (!confirm("이 글을 삭제할까요? 되돌릴 수 없어요.")) return;
    await deletePost(post.id);
    router.push("/community");
  };

  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id);
    setEditCommentBody(c.body);
  };

  const saveEditComment = async (id: string) => {
    if (!editCommentBody.trim()) return;
    await updateComment(id, editCommentBody.trim());
    setEditingCommentId(null);
    load();
  };

  const removeComment = async (id: string) => {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    await deleteComment(id);
    load();
  };

  const isMinePost = !!session && !!post?.userId && session.user.id === post.userId;

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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={pillBadge("violet")}>{CATEGORY_LABEL[post.category]}</span>
                {isMinePost && !editingPost && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={startEditPost} style={inlineActionStyle}>
                      수정
                    </button>
                    <button onClick={removePost} style={{ ...inlineActionStyle, color: COLORS.danger }}>
                      삭제
                    </button>
                  </div>
                )}
              </div>

              {editingPost ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={inputStyle} />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={8}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={saveEditPost}
                      style={{ ...PRIMARY_BUTTON, width: "auto", padding: "10px 18px" }}
                    >
                      저장
                    </button>
                    <button onClick={() => setEditingPost(false)} style={inlineActionStyle}>
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 style={{ fontSize: "20px", fontWeight: 800, color: COLORS.ink, marginTop: "12px" }}>
                    {post.title}
                  </h1>
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px", fontSize: "12px", color: COLORS.onDarkFaint }}>
                    <span>{post.author}</span>
                    {post.badge && <span>· {post.badge}</span>}
                    <span>· {formatRelativeTime(post.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: "15px", color: "#3f3f46", marginTop: "16px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {post.body}
                  </p>
                </>
              )}
            </section>

            <h2 style={{ fontSize: "15px", fontWeight: 700, color: COLORS.onDark, margin: "24px 0 12px" }}>
              댓글 {comments.length}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {comments.length === 0 && (
                <p style={{ fontSize: "13px", color: COLORS.onDarkFaint }}>첫 댓글을 남겨보세요.</p>
              )}
              {comments.map((c) => {
                const isMineComment = !!session && !!c.userId && session.user.id === c.userId;
                return (
                  <section key={c.id} style={{ ...CARD_STYLE, padding: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                        color: COLORS.onDarkFaint,
                      }}
                    >
                      <div style={{ display: "flex", gap: "8px" }}>
                        <span style={{ fontWeight: 700, color: COLORS.inkMuted }}>{c.author}</span>
                        <span>{formatRelativeTime(c.createdAt)}</span>
                      </div>
                      {isMineComment && editingCommentId !== c.id && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => startEditComment(c)} style={inlineActionStyle}>
                            수정
                          </button>
                          <button onClick={() => removeComment(c.id)} style={{ ...inlineActionStyle, color: COLORS.danger }}>
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                    {editingCommentId === c.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                        <textarea
                          value={editCommentBody}
                          onChange={(e) => setEditCommentBody(e.target.value)}
                          rows={3}
                          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                        />
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => saveEditComment(c.id)}
                            style={{ ...PRIMARY_BUTTON, width: "auto", padding: "8px 14px", fontSize: "13px" }}
                          >
                            저장
                          </button>
                          <button onClick={() => setEditingCommentId(null)} style={inlineActionStyle}>
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: "14px", color: "#3f3f46", marginTop: "6px" }}>{c.body}</p>
                    )}
                  </section>
                );
              })}
            </div>

            {loaded && !session && (
              <div
                style={{
                  ...CARD_STYLE,
                  textAlign: "center",
                  padding: "20px",
                  marginBottom: "10px",
                }}
              >
                <p style={{ fontSize: "13px", color: COLORS.inkMuted, marginBottom: "12px" }}>
                  댓글을 남기려면 로그인해주세요.
                </p>
                <button
                  onClick={() =>
                    supabase?.auth.signInWithOAuth({
                      provider: "kakao",
                      options: { redirectTo: window.location.href },
                    })
                  }
                  style={{
                    background: "#FEE500",
                    border: "none",
                    borderRadius: "999px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#191919",
                  }}
                >
                  카카오로 로그인
                </button>
              </div>
            )}

            {session && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <button
                  onClick={() => setCommentAsSelf(false)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: `1.5px solid ${!commentAsSelf ? COLORS.ink : COLORS.cardBorder}`,
                    background: !commentAsSelf ? COLORS.ink : "#ffffff",
                    color: !commentAsSelf ? "#ffffff" : COLORS.inkMuted,
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  익명
                </button>
                <button
                  onClick={() => setCommentAsSelf(true)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: `1.5px solid ${commentAsSelf ? COLORS.ink : COLORS.cardBorder}`,
                    background: commentAsSelf ? COLORS.ink : "#ffffff",
                    color: commentAsSelf ? "#ffffff" : COLORS.inkMuted,
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  {getNickname(session)}
                </button>
              </div>
            )}

            {session && (
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
            )}
          </>
        )}
      </main>
    </div>
  );
}

const inlineActionStyle = {
  background: "none",
  border: "none",
  fontSize: "12px",
  fontWeight: 700,
  color: COLORS.inkMuted,
  padding: 0,
} as const;
