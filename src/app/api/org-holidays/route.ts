import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

export async function GET() {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const holidays = await prisma.orgHoliday.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(holidays);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

// 組織の非稼働日を追加（管理者のみ）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const date = body.date ? new Date(body.date) : null;
    if (!date || isNaN(date.getTime())) {
      return NextResponse.json({ error: "BAD_DATE" }, { status: 400 });
    }
    const holiday = await prisma.orgHoliday.upsert({
      where: { orgId_date: { orgId: ctx.orgId, date } },
      create: {
        orgId: ctx.orgId,
        date,
        note: body.note?.toString() || null,
      },
      update: { note: body.note?.toString() || null },
    });
    return NextResponse.json(holiday, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
