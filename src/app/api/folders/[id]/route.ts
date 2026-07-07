import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

async function editableGuard(userId: string, folderId: string) {
  const ctx = await requireOrgContext(userId);
  if (ctx.role === "VIEWER") return null;
  const folder = await prisma.projectFolder.findFirst({
    where: { id: folderId, orgId: ctx.orgId },
  });
  return folder;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await editableGuard(userId, id))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    const folder = await prisma.projectFolder.update({
      where: { id },
      data: { name },
    });
    return NextResponse.json(folder);
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
    if (!(await editableGuard(userId, id))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    // フォルダ内のプロジェクトは未分類に戻る（onDelete: SetNull）
    await prisma.projectFolder.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
