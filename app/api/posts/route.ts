import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "../../../lib/communityDb";

// 글쓰기는 로그인이 필요해서(auth.uid()가 있어야 함), 로그인한 브라우저가 supabase에 직접
// insert한다(lib/communityClient.ts). 이 라우트는 비로그인 사용자도 볼 수 있는 목록 조회만 담당.

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category");
    const posts = await listPosts(category);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
