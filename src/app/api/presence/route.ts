import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

const ONLINE_WINDOW_MS = 3 * 60 * 1000; // 3分以内ならオンライン扱い

// ハートビート：自分の最終アクセス時刻を更新
export async function POST() {
  try {
    const userId = await requireUserId();
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

// 現在の組織でオンラインのメンバー一覧
export async function GET() {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const since = new Date(Date.now() - ONLINE_WINDOW_MS);
    const members = await prisma.organizationMember.findMany({
      where: { orgId: ctx.orgId, user: { lastSeenAt: { gte: since } } },
      include: { user: true },
    });
    return NextResponse.json(
      members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
      }))
    );
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
