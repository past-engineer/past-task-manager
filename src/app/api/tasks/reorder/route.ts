import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";
import { isTaskStatus } from "@/lib/constants";
import { logActivity } from "@/lib/audit";
import type { NotifyOutcome } from "@/lib/types";
import {
  notifyReviewTransition,
  validateReviewTransition,
} from "@/lib/notify";

// カンバン/リストのドラッグ後にまとめて並び順とステータスを更新
// body: {
//   projectId,
//   updates: [{ id, status, position }],
//   // レビュー関連の遷移をD&Dで行った場合の付帯情報（ポップアップで確定）
//   review?: { taskId, reviewerId?, notify }
// }
export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const projectId = (body.projectId ?? "").toString();
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const review =
      body.review && typeof body.review.taskId === "string"
        ? {
            taskId: body.review.taskId as string,
            reviewerId:
              body.review.reviewerId === undefined
                ? undefined
                : (body.review.reviewerId as string) || null,
            notify: body.review.notify === true,
          }
        : null;

    if (!projectId || updates.length === 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    const role = await getProjectRole(projectId, userId);
    if (!canEdit(role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // 変更前の状態を記録（巻き戻し・レビュー遷移判定用）
    const ids = updates
      .filter((u: { id?: string }) => u && u.id)
      .map((u: { id: string }) => u.id);
    const beforeTasks = await prisma.task.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        projectId: true,
        status: true,
        position: true,
        assigneeId: true,
        reviewerId: true,
      },
    });
    const beforeById = new Map(beforeTasks.map((t) => [t.id, t]));

    // レビュー関連の遷移バリデーション
    for (const u of updates as {
      id?: string;
      status?: string;
    }[]) {
      if (!u?.id || !isTaskStatus(u.status)) continue;
      const before = beforeById.get(u.id);
      if (!before || before.status === u.status) continue;
      const nextReviewerId =
        review && review.taskId === u.id && review.reviewerId !== undefined
          ? review.reviewerId
          : before.reviewerId;
      const err = validateReviewTransition({
        from: before.status,
        to: u.status,
        reviewerId: nextReviewerId,
        actorId: userId,
        isAdmin: role === "ADMIN",
      });
      if (err === "REVIEWER_REQUIRED") {
        return NextResponse.json({ error: err }, { status: 400 });
      }
      if (err === "REVIEWER_ONLY") {
        return NextResponse.json({ error: err }, { status: 403 });
      }
    }

    const ops = updates
      .filter((u: { id?: string }) => u && u.id)
      .map((u: { id: string; status?: string; position?: number }) => {
        const before = beforeById.get(u.id);
        const statusChanged =
          isTaskStatus(u.status) && before && before.status !== u.status;
        return prisma.task.update({
          where: { id: u.id },
          data: {
            status: isTaskStatus(u.status) ? u.status : undefined,
            position:
              u.position === undefined ? undefined : Number(u.position),
            // ポップアップで指定されたレビュー担当を反映
            reviewerId:
              review && review.taskId === u.id &&
              review.reviewerId !== undefined
                ? review.reviewerId
                : undefined,
            // レビュー待ちに入るタイミングで依頼日時を更新
            reviewRequestedAt:
              statusChanged && u.status === "IN_REVIEW"
                ? new Date()
                : undefined,
          },
        });
      });

    await prisma.$transaction(ops);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true, name: true },
    });
    let notifyOutcome: NotifyOutcome | null = null;
    if (project?.orgId) {
      await logActivity({
        orgId: project.orgId,
        actorId: userId,
        entity: "task-batch",
        entityId: projectId,
        action: "update",
        summary: `「${project.name}」でタスクを並べ替え（${beforeTasks.length}件）`,
        before: beforeTasks.map((t) => ({
          id: t.id,
          status: t.status,
          position: t.position,
        })),
        after: updates,
      });

      // 通知はポップアップのチェックボックスで明示された場合のみ（オプトイン）
      if (review?.notify) {
        const before = beforeById.get(review.taskId);
        const u = (updates as { id?: string; status?: string }[]).find(
          (x) => x?.id === review.taskId
        );
        if (before && u && isTaskStatus(u.status) && before.status !== u.status) {
          const [actor, after] = await Promise.all([
            prisma.user.findUnique({
              where: { id: userId },
              select: { name: true, email: true },
            }),
            prisma.task.findUnique({
              where: { id: review.taskId },
              select: {
                id: true,
                projectId: true,
                title: true,
                assigneeId: true,
                reviewerId: true,
              },
            }),
          ]);
          if (after) {
            notifyOutcome = await notifyReviewTransition({
              orgId: project.orgId,
              actorId: userId,
              actorName: actor?.name ?? actor?.email ?? "メンバー",
              task: after,
              from: before.status,
              to: u.status,
            });
          }
        }
      }
    }
    return NextResponse.json({ ok: true, notify: notifyOutcome });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
