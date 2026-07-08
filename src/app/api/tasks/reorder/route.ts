import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";
import { isTaskStatus } from "@/lib/constants";
import { logActivity } from "@/lib/audit";

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
    if (!canEdit(await getProjectRole(projectId, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // 変更前の状態を記録（巻き戻し用）
    const ids = updates
      .filter((u: { id?: string }) => u && u.id)
      .map((u: { id: string }) => u.id);
    const beforeTasks = await prisma.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, position: true },
    });

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

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true, name: true },
    });
    if (project?.orgId) {
      await logActivity({
        orgId: project.orgId,
        actorId: userId,
        entity: "task-batch",
        entityId: projectId,
        action: "update",
        summary: `「${project.name}」でタスクを並べ替え（${beforeTasks.length}件）`,
        before: beforeTasks,
        after: updates,
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
