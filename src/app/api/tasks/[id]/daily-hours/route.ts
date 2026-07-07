import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getTaskRole, canEdit } from "@/lib/org";

/** フレキシブルモードの日毎稼働時間を upsert（hours <= 0 で削除） */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!canEdit(await getTaskRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const date = body.date ? new Date(body.date) : null;
    if (!date || isNaN(date.getTime())) {
      return NextResponse.json({ error: "BAD_DATE" }, { status: 400 });
    }
    const hours = Number(body.hours);
    if (isNaN(hours) || hours > 24) {
      return NextResponse.json({ error: "BAD_HOURS" }, { status: 400 });
    }

    if (hours <= 0) {
      await prisma.taskDailyHours.deleteMany({
        where: { taskId: id, date },
      });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const record = await prisma.taskDailyHours.upsert({
      where: { taskId_date: { taskId: id, date } },
      create: { taskId: id, date, hours },
      update: { hours },
    });
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
