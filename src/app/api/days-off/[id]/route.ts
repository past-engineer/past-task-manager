import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const dayOff = await prisma.dayOff.findFirst({
      where: {
        id,
        OR: [
          { userId },
          {
            user: {
              memberships: {
                some: { project: { members: { some: { userId } } } },
              },
            },
          },
        ],
      },
    });
    if (!dayOff) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    await prisma.dayOff.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
