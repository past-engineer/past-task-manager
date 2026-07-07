import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";

/** 対象ユーザーが自分とプロジェクトを共有しているか（自分自身は常にOK） */
async function canManageUser(targetUserId: string, userId: string) {
  if (targetUserId === userId) return true;
  const shared = await prisma.projectMember.findFirst({
    where: {
      userId: targetUserId,
      project: { members: { some: { userId } } },
    },
    select: { id: true },
  });
  return !!shared;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await canManageUser(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    if (body.dailyCapacity === undefined) {
      return NextResponse.json({ error: "NO_FIELDS" }, { status: 400 });
    }
    let dailyCapacity: number | null = null;
    if (body.dailyCapacity !== null && body.dailyCapacity !== "") {
      const h = Number(body.dailyCapacity);
      if (isNaN(h) || h <= 0 || h > 24) {
        return NextResponse.json({ error: "BAD_HOURS" }, { status: 400 });
      }
      dailyCapacity = h;
    }
    const user = await prisma.user.update({
      where: { id },
      data: { dailyCapacity },
      select: { id: true, dailyCapacity: true },
    });
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
