import { NextRequest, NextResponse } from "next/server";
import { addComment } from "../../../../../lib/communityDb";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { author, commentBody } = body as { author: string; commentBody: string };

  if (!author?.trim() || !commentBody?.trim()) {
    return NextResponse.json({ error: "필수 값이 비어 있습니다." }, { status: 400 });
  }

  try {
    const comment = await addComment(id, { author: author.trim(), body: commentBody.trim() });
    return NextResponse.json({ comment });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
