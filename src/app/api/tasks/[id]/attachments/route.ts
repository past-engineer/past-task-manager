import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getTaskRole, canEdit } from "@/lib/org";

export const runtime = "nodejs";

// ファイルアップロード（multipart/form-data, field: "file"）
// 注: Vercel のサーバーレス関数は body 約4.5MBが上限。大きいファイルは
// クライアントアップロード方式への切替を検討（README参照）。
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!canEdit(await getTaskRole(id, userId))) {
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

    const blob = await put(`tasks/${id}/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    const attachment = await prisma.attachment.create({
      data: {
        taskId: id,
        uploaderId: userId,
        filename: file.name,
        url: blob.url,
        pathname: blob.pathname,
        size: file.size,
        contentType: file.type || null,
      },
      include: { uploader: true },
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
