import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

export async function GET() {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const folders = await prisma.projectFolder.findMany({
      where: { orgId: ctx.orgId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(folders);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role === "VIEWER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    let parentId: string | null = null;
    let archived = !!body.archived;
    if (body.parentId) {
      const parent = await prisma.projectFolder.findFirst({
        where: { id: body.parentId.toString(), orgId: ctx.orgId },
      });
      if (!parent) {
        return NextResponse.json({ error: "BAD_PARENT" }, { status: 400 });
      }
      parentId = parent.id;
      // アーカイブ済みフォルダの中に作る場合は自身もアーカイブ扱い
      if (parent.archived) archived = true;
    }
    const last = await prisma.projectFolder.findFirst({
      where: { orgId: ctx.orgId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const folder = await prisma.projectFolder.create({
      data: {
        name,
        orgId: ctx.orgId,
        parentId,
        archived,
        position: (last?.position ?? 0) + 1,
      },
    });
    return NextResponse.json(folder, { status: 201 });
  } catch (e) {
    console.error("[folders POST]", e);
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
