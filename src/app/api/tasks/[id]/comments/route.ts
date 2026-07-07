import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessTask } from "@/lib/data";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await userCanAccessTask(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const text = (body.body ?? "").toString().trim();
    if (!text) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    const comment = await prisma.comment.create({
      data: { taskId: id, authorId: userId, body: text },
      include: { author: true },
    });
    return NextResponse.json(comment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
