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

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const target = searchParams.get("userId");
    const daysOff = await prisma.dayOff.findMany({
      where: target
        ? { userId: target }
        : {
            user: {
              memberships: {
                some: { project: { members: { some: { userId } } } },
              },
            },
          },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(daysOff);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const targetUserId = (body.userId ?? "").toString();
    const date = body.date ? new Date(body.date) : null;
    if (!targetUserId || !date || isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "userId and date are required" },
        { status: 400 }
      );
    }
    if (!(await canManageUser(targetUserId, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const dayOff = await prisma.dayOff.upsert({
      where: { userId_date: { userId: targetUserId, date } },
      create: {
        userId: targetUserId,
        date,
        note: body.note?.toString() || null,
      },
      update: { note: body.note?.toString() || null },
    });
    return NextResponse.json(dayOff, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
