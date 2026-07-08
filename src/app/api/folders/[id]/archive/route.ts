import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

/** 子孫フォルダ ID を自身含めて収集 */
async function collectIds(rootId: string): Promise<string[]> {
  const out = [rootId];
  let frontier = [rootId];
  for (let i = 0; i < 50 && frontier.length > 0; i++) {
    const kids = await prisma.projectFolder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = kids.map((k) => k.id).filter((k) => !out.includes(k));
    out.push(...frontier);
  }
  return out;
}

// フォルダごとアーカイブ / 復元 / 同名アーカイブへの統合
// body: { merge?: boolean, restore?: boolean }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role === "VIEWER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const folder = await prisma.projectFolder.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!folder) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const ids = await collectIds(id);

    // 復元：フォルダ＋子孫＋中のプロジェクトを戻す（最上位に配置）
    if (body.restore) {
      await prisma.$transaction([
        prisma.projectFolder.updateMany({
          where: { id: { in: ids } },
          data: { archived: false },
        }),
        prisma.projectFolder.update({
          where: { id },
          data: { parentId: null },
        }),
        prisma.project.updateMany({
          where: { folderId: { in: ids } },
          data: { archived: false },
        }),
      ]);
      return NextResponse.json({ ok: true, restored: true });
    }

    // 同名のアーカイブ済みフォルダがあるか（自分の子孫は除外）
    const conflict = await prisma.projectFolder.findFirst({
      where: {
        orgId: ctx.orgId,
        archived: true,
        name: folder.name,
        id: { notIn: ids },
      },
    });

    if (conflict && !body.merge) {
      return NextResponse.json(
        { conflict: true, name: folder.name },
        { status: 409 }
      );
    }

    if (conflict && body.merge) {
      // 直下の中身を統合先へ移動 → 中身をアーカイブ → 元フォルダを削除
      const childIds = ids.filter((x) => x !== id);
      await prisma.$transaction([
        prisma.project.updateMany({
          where: { folderId: id },
          data: { folderId: conflict.id, archived: true },
        }),
        prisma.projectFolder.updateMany({
          where: { parentId: id },
          data: { parentId: conflict.id },
        }),
        ...(childIds.length > 0
          ? [
              prisma.projectFolder.updateMany({
                where: { id: { in: childIds } },
                data: { archived: true },
              }),
              prisma.project.updateMany({
                where: { folderId: { in: childIds } },
                data: { archived: true },
              }),
            ]
          : []),
        prisma.projectFolder.delete({ where: { id } }),
      ]);
      return NextResponse.json({ ok: true, merged: true });
    }

    // 通常アーカイブ：フォルダ＋子孫＋中のプロジェクト
    await prisma.$transaction([
      prisma.projectFolder.updateMany({
        where: { id: { in: ids } },
        data: { archived: true },
      }),
      prisma.projectFolder.update({ where: { id }, data: { parentId: null } }),
      prisma.project.updateMany({
        where: { folderId: { in: ids } },
        data: { archived: true },
      }),
    ]);
    return NextResponse.json({ ok: true, archived: true });
  } catch (e) {
    console.error("[folders archive]", e);
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
