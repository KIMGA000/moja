import { NextRequest, NextResponse } from "next/server";
import { createPost, listPosts } from "../../../lib/communityDb";
import type { Category } from "../../data/community";

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category");
    const posts = await listPosts(category);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category, title, postBody, author, badge } = body as {
    category: Category;
    title: string;
    postBody: string;
    author: string;
    badge: string | null;
  };

  if (!category || !title?.trim() || !postBody?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "필수 값이 비어 있습니다." }, { status: 400 });
  }

  try {
    const post = await createPost({
      category,
      title: title.trim(),
      body: postBody.trim(),
      author: author.trim(),
      badge: badge || null,
    });
    return NextResponse.json({ post });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
