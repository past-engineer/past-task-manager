import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessProject } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";

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
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
