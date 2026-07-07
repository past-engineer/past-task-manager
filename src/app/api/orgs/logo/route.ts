import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

export const runtime = "nodejs";

// 組織ロゴのアップロード（管理者のみ、multipart/form-data, field: "file"）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role !== "ADMIN") {
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
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "2MB 以下の画像を指定してください" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
    });
    if (!org) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const blob = await put(`orgs/${ctx.orgId}/logo-${Date.now()}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    if (org.logoUrl) {
      try {
        await del(org.logoUrl);
      } catch {
        // 失敗しても続行
      }
    }

    const updated = await prisma.organization.update({
      where: { id: ctx.orgId },
      data: { logoUrl: blob.url, logoPath: blob.pathname },
    });
    return NextResponse.json({ logoUrl: updated.logoUrl });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
    });
    if (!org) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (org.logoUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(org.logoUrl);
      } catch {
        // 失敗しても続行
      }
    }
    await prisma.organization.update({
      where: { id: ctx.orgId },
      data: { logoUrl: null, logoPath: null },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
