import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const { id } = await params;
    const dayOff = await prisma.dayOff.findFirst({
      where: {
        id,
        user: { orgMemberships: { some: { orgId: ctx.orgId } } },
      },
    });
    if (!dayOff) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (ctx.role === "VIEWER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (dayOff.userId !== userId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    await prisma.dayOff.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
