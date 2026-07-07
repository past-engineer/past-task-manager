import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext, getOrgRole } from "@/lib/org";

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const { searchParams } = new URL(req.url);
    const target = searchParams.get("userId");
    const daysOff = await prisma.dayOff.findMany({
      where: {
        user: { orgMemberships: { some: { orgId: ctx.orgId } } },
        ...(target ? { userId: target } : {}),
      },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(daysOff);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

// 自分の非稼働日は参加者以上、他人の分は管理者のみ
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const body = await req.json();
    const targetUserId = (body.userId ?? "").toString();
    const date = body.date ? new Date(body.date) : null;
    if (!targetUserId || !date || isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "userId and date are required" },
        { status: 400 }
      );
    }
    if (ctx.role === "VIEWER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (targetUserId !== userId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    // 対象ユーザーが同じ組織のメンバーであること
    if (!(await getOrgRole(ctx.orgId, targetUserId))) {
      return NextResponse.json({ error: "NOT_IN_ORG" }, { status: 400 });
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
