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

/** parentId の変更が循環（自分自身または自分の子孫への移動）にならないか */
async function wouldCreateCycle(folderId: string, newParentId: string) {
  let cur: string | null = newParentId;
  for (let i = 0; i < 100 && cur; i++) {
    if (cur === folderId) return true;
    const parent: { parentId: string | null } | null =
      await prisma.projectFolder.findUnique({
        where: { id: cur },
        select: { parentId: true },
      });
    cur = parent?.parentId ?? null;
  }
  return false;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const folder = await editableGuard(userId, id);
    if (!folder) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();

    const data: { name?: string; parentId?: string | null } = {};

    if (body.name !== undefined) {
      const name = body.name.toString().trim();
      if (!name) {
        return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
      }
      data.name = name;
    }

    if (body.parentId !== undefined) {
      const parentId = body.parentId || null;
      if (parentId) {
        const parent = await prisma.projectFolder.findFirst({
          where: { id: parentId, orgId: folder.orgId },
        });
        if (!parent) {
          return NextResponse.json({ error: "BAD_PARENT" }, { status: 400 });
        }
        if (parentId === id || (await wouldCreateCycle(id, parentId))) {
          return NextResponse.json(
            { error: "フォルダを自身の中に移動することはできません" },
            { status: 400 }
          );
        }
      }
      data.parentId = parentId;
    }

    const updated = await prisma.projectFolder.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
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
