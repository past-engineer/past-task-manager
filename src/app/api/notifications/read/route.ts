import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";

// 既読化: { ids: string[] } または { all: true }
export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    if (body.all === true) {
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
