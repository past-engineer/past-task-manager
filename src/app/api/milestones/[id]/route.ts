import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";
import { logActivity } from "@/lib/audit";

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
    const editable = await findEditable(id, userId);
    if (!editable) {
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
    const milestone = await prisma.milestone.update({
      where: { id },
      data,
      include: { project: { select: { orgId: true } } },
    });
    if (milestone.project.orgId) {
      await logActivity({
        orgId: milestone.project.orgId,
        actorId: userId,
        entity: "milestone",
        entityId: id,
        action: "update",
        summary: `マイルストーン「${editable.title}」を更新`,
        before: {
          projectId: editable.projectId,
          title: editable.title,
          date: editable.date,
        },
        after: { title: milestone.title, date: milestone.date },
      });
    }
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
    const editable = await findEditable(id, userId);
    if (!editable) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const project = await prisma.project.findUnique({
      where: { id: editable.projectId },
      select: { orgId: true },
    });
    await prisma.milestone.delete({ where: { id } });
    if (project?.orgId) {
      await logActivity({
        orgId: project.orgId,
        actorId: userId,
        entity: "milestone",
        entityId: id,
        action: "delete",
        summary: `マイルストーン「${editable.title}」を削除`,
        before: {
          projectId: editable.projectId,
          title: editable.title,
          date: editable.date,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
