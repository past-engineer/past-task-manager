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
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const { id } = await params;
    const holiday = await prisma.orgHoliday.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!holiday) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    await prisma.orgHoliday.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
