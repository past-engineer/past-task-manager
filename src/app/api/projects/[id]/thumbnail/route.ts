import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";

export const runtime = "nodejs";

// サムネイルのアップロード（multipart/form-data, field: "file"）
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!canEdit(await getProjectRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN が未設定です" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "画像ファイルを指定してください" },
        { status: 400 }
      );
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "4MB 以下の画像を指定してください" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const blob = await put(`projects/${id}/thumb-${Date.now()}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    // 古いサムネイルを削除
    if (project.thumbnailUrl) {
      try {
        await del(project.thumbnailUrl);
      } catch {
        // 失敗しても続行
      }
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { thumbnailUrl: blob.url, thumbnailPath: blob.pathname },
    });
    return NextResponse.json({ thumbnailUrl: updated.thumbnailUrl });
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
    if (!canEdit(await getProjectRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (project.thumbnailUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(project.thumbnailUrl);
      } catch {
        // 失敗しても続行
      }
    }
    await prisma.project.update({
      where: { id },
      data: { thumbnailUrl: null, thumbnailPath: null },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
