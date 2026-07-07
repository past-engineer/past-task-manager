import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessProject } from "@/lib/data";
import { isTaskStatus } from "@/lib/constants";

// カンバン/リストのドラッグ後にまとめて並び順とステータスを更新
// body: { projectId, updates: [{ id, status, position }] }
export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const projectId = (body.projectId ?? "").toString();
    const updates = Array.isArray(body.updates) ? body.updates : [];

    if (!projectId || updates.length === 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    if (!(await userCanAccessProject(projectId, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const ops = updates
      .filter((u: { id?: string }) => u && u.id)
      .map((u: { id: string; status?: string; position?: number }) =>
        prisma.task.update({
          where: { id: u.id },
          data: {
            status: isTaskStatus(u.status) ? u.status : undefined,
            position:
              u.position === undefined ? undefined : Number(u.position),
          },
        })
      );

    await prisma.$transaction(ops);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
