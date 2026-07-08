import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessProject } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";
import { logActivity } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await userCanAccessProject(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const project = await prisma.project.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!canEdit(await getProjectRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const beforeP = await prisma.project.findUnique({ where: { id } });
    const project = await prisma.project.update({
      where: { id },
      data: {
        name: body.name?.toString(),
        description:
          body.description === undefined ? undefined : body.description,
        color: body.color?.toString(),
        folderId:
          body.folderId === undefined ? undefined : body.folderId || null,
        archived: body.archived === undefined ? undefined : !!body.archived,
      },
    });
    if (beforeP?.orgId) {
      await logActivity({
        orgId: beforeP.orgId,
        actorId: userId,
        entity: "project",
        entityId: id,
        action: "update",
        summary: `プロジェクト「${beforeP.name}」を更新`,
        before: {
          name: beforeP.name,
          description: beforeP.description,
          color: beforeP.color,
          folderId: beforeP.folderId,
          archived: beforeP.archived,
        },
        after: {
          name: project.name,
          description: project.description,
          color: project.color,
          folderId: project.folderId,
          archived: project.archived,
        },
      });
    }
    return NextResponse.json(project);
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
    // 削除は組織の管理者、またはプロジェクトのオーナーのみ
    const orgRole = await getProjectRole(id, userId);
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    });
    const isOwner = member?.role === "OWNER" && canEdit(orgRole);
    if (orgRole !== "ADMIN" && !isOwner) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const beforeP = await prisma.project.findUnique({ where: { id } });
    await prisma.project.delete({ where: { id } });
    if (beforeP?.orgId) {
      await logActivity({
        orgId: beforeP.orgId,
        actorId: userId,
        entity: "project",
        entityId: id,
        action: "delete",
        summary: `プロジェクト「${beforeP.name}」を削除`,
        before: {
          orgId: beforeP.orgId,
          name: beforeP.name,
          description: beforeP.description,
          color: beforeP.color,
          folderId: beforeP.folderId,
          archived: beforeP.archived,
          thumbnailUrl: beforeP.thumbnailUrl,
          thumbnailPath: beforeP.thumbnailPath,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
