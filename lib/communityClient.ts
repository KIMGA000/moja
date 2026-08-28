"use client";

// 로그인한 사용자가 직접 브라우저에서 Supabase에 쓰는 함수들. 서버 API 라우트(communityDb.ts)를
// 거치지 않고 브라우저의 인증된 supabase 클라이언트로 바로 호출해야, 세션의 access token이
// 자동으로 실려서 DB의 `default auth.uid()`가 정확히 채워지고, 수정·삭제 시 RLS가
// "본인 글인지"를 안전하게 검증할 수 있다 (클라이언트가 user_id를 직접 지정하게 하면
// 남의 글을 자기 것처럼 속일 수 있어서 절대 클라이언트에서 user_id를 넘기지 않는다).

import { supabase } from "./supabase";
import type { Category, Comment, Post } from "../app/data/community";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase가 설정되지 않았어요. .env.local을 확인해주세요.");
  return supabase;
}

type PostRow = {
  id: string;
  category: Category;
  title: string;
  body: string;
  author: string;
  badge: string | null;
  user_id: string | null;
  created_at: string;
};

type CommentRow = {
  id: string;
  post_id: string;
  author: string;
  body: string;
  user_id: string | null;
  created_at: string;
  community_posts?: { title: string } | null;
};

function toPost(row: PostRow, commentCount = 0): Post {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    author: row.author,
    badge: row.badge,
    userId: row.user_id,
    createdAt: new Date(row.created_at).getTime(),
    commentCount,
  };
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    author: row.author,
    body: row.body,
    userId: row.user_id,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function createPostAsUser(input: {
  category: Category;
  title: string;
  body: string;
  author: string;
  badge: string | null;
}): Promise<Post> {
  const db = requireSupabase();
  const { data, error } = await db
    .from("community_posts")
    .insert({ category: input.category, title: input.title, body: input.body, author: input.author, badge: input.badge })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toPost(data as PostRow);
}

export async function addCommentAsUser(postId: string, input: { author: string; body: string }): Promise<Comment> {
  const db = requireSupabase();
  const { data, error } = await db
    .from("community_comments")
    .insert({ post_id: postId, author: input.author, body: input.body })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toComment(data as CommentRow);
}

export async function updatePost(id: string, input: { title: string; body: string }): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from("community_posts").update({ title: input.title, body: input.body }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePost(id: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from("community_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateComment(id: string, body: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from("community_comments").update({ body }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteComment(id: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from("community_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMyPosts(userId: string): Promise<Post[]> {
  const db = requireSupabase();
  const { data, error } = await db
    .from("community_posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PostRow[]).map((row) => toPost(row));
}

export async function listMyComments(userId: string): Promise<(Comment & { postTitle: string | null })[]> {
  const db = requireSupabase();
  const { data, error } = await db
    .from("community_comments")
    .select("*, community_posts(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CommentRow[]).map((row) => ({
    ...toComment(row),
    postTitle: row.community_posts?.title ?? null,
  }));
}
