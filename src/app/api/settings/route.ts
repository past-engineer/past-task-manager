import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, getWorkspaceSettings } from "@/lib/data";

export async function GET() {
  try {
    await requireUserId();
    const settings = await getWorkspaceSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireUserId();
    const body = await req.json();

    const data: { nonWorkingWeekdays?: number[]; dailyWorkHours?: number } =
      {};

    if (body.nonWorkingWeekdays !== undefined) {
      const days = body.nonWorkingWeekdays;
      if (
        !Array.isArray(days) ||
        days.some((d) => typeof d !== "number" || d < 0 || d > 6)
      ) {
        return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
      }
      data.nonWorkingWeekdays = [...new Set(days as number[])].sort();
    }

    if (body.dailyWorkHours !== undefined) {
      const h = Number(body.dailyWorkHours);
      if (isNaN(h) || h <= 0 || h > 24) {
        return NextResponse.json({ error: "BAD_HOURS" }, { status: 400 });
      }
      data.dailyWorkHours = h;
    }

    const setting = await prisma.workspaceSetting.upsert({
      where: { id: "global" },
      create: { id: "global", ...data },
      update: data,
    });
    return NextResponse.json({
      nonWorkingWeekdays: setting.nonWorkingWeekdays,
      dailyWorkHours: setting.dailyWorkHours,
    });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
