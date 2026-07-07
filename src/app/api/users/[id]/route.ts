import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext, getOrgRole } from "@/lib/org";

// 稼働限界の変更：自分は参加者以上、他人は管理者のみ
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const { id } = await params;
    if (ctx.role === "VIEWER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (id !== userId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (!(await getOrgRole(ctx.orgId, id))) {
      return NextResponse.json({ error: "NOT_IN_ORG" }, { status: 400 });
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
