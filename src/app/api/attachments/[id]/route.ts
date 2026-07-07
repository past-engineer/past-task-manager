import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessTask } from "@/lib/data";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!(await userCanAccessTask(attachment.taskId, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(attachment.url);
      } catch {
        // blob 削除失敗は無視してレコードは消す
      }
    }
    await prisma.attachment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
