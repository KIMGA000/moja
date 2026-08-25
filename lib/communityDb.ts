import { supabase } from "./supabase";
import type { Category, Comment, Post } from "../app/data/community";

// 커뮤니티 게시글·댓글은 Supabase(community_posts / community_comments 테이블)에 저장한다.
// 예전에는 프로젝트 폴더의 JSON 파일에 저장했는데, Vercel 배포 환경은 파일시스템이 읽기 전용이라
// 그 방식은 배포본에서 동작하지 않는다 (supabase/schema.sql에 이 테이블들의 스키마가 있다).

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
};

function requireSupabase() {
  if (!supabase) throw new Error("Supabase가 설정되지 않았어요. .env.local을 확인해주세요.");
  return supabase;
}

function toPost(row: PostRow, commentCount: number): Post {
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

export async function listPosts(category: string | null): Promise<Post[]> {
  const db = requireSupabase();

  let query = db.from("community_posts").select("*").order("created_at", { ascending: false });
  if (category && category !== "all") {
    query = query.eq("category", category);
  }
  const { data: postRows, error: postError } = await query;
  if (postError) throw new Error(postError.message);
  const posts = (postRows ?? []) as PostRow[];

  const { data: commentRows, error: commentError } = await db
    .from("community_comments")
    .select("post_id");
  if (commentError) throw new Error(commentError.message);

  const counts = new Map<string, number>();
  for (const row of (commentRows ?? []) as { post_id: string }[]) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
  }

  return posts.map((row) => toPost(row, counts.get(row.id) ?? 0));
}

export async function getPostWithComments(
  id: string
): Promise<{ post: Post; comments: Comment[] } | null> {
  const db = requireSupabase();

  const { data: postRow, error: postError } = await db
    .from("community_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (postError) throw new Error(postError.message);
  if (!postRow) return null;

  const { data: commentRows, error: commentError } = await db
    .from("community_comments")
    .select("*")
    .eq("post_id", id)
    .order("created_at", { ascending: true });
  if (commentError) throw new Error(commentError.message);

  const comments = ((commentRows ?? []) as CommentRow[]).map(toComment);
  return { post: toPost(postRow as PostRow, comments.length), comments };
}
