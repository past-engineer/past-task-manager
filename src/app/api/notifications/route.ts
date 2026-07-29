import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";

// 自分宛の通知一覧＋未読件数
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20) || 20, 50);

    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);
    return NextResponse.json({ items, unread });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
