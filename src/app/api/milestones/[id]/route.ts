import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";

async function findEditable(id: string, userId: string) {
  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) return null;
  if (!canEdit(await getProjectRole(milestone.projectId, userId))) return null;
  return milestone;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await findEditable(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const data: { title?: string; date?: Date } = {};
    if (body.title !== undefined) {
      const title = body.title.toString().trim();
      if (!title)
        return NextResponse.json({ error: "EMPTY_TITLE" }, { status: 400 });
      data.title = title;
    }
    if (body.date !== undefined) {
      const date = new Date(body.date);
      if (isNaN(date.getTime()))
        return NextResponse.json({ error: "BAD_DATE" }, { status: 400 });
      data.date = date;
    }
    const milestone = await prisma.milestone.update({ where: { id }, data });
    return NextResponse.json(milestone);
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await findEditable(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    await prisma.milestone.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
