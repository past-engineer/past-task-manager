import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessTask } from "@/lib/data";
import { getTaskRole, canEdit } from "@/lib/org";
import { isTaskStatus } from "@/lib/constants";
import {
  notifyReviewTransition,
  validateReviewTransition,
} from "@/lib/notify";
import {
  logActivity,
  pickTaskSnapshot,
  TASK_FIELD_LABELS,
} from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await userCanAccessTask(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: true,
        reviewer: true,
        subtasks: {
          include: { assignee: true },
          orderBy: { position: "asc" },
        },
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" },
        },
        attachments: {
          include: { uploader: true },
          orderBy: { createdAt: "desc" },
        },
        dailyHours: { orderBy: { date: "asc" } },
      },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const role = await getTaskRole(id, userId);
    if (!canEdit(role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();

    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (body.title !== undefined) data.title = body.title.toString();
    if (body.description !== undefined)
      data.description = body.description?.toString() || null;
    if (body.status !== undefined && isTaskStatus(body.status))
      data.status = body.status;
    if (body.assigneeId !== undefined)
      data.assigneeId = body.assigneeId || null;
    if (body.reviewerId !== undefined)
      data.reviewerId = body.reviewerId || null;
    if (body.estimate !== undefined)
      data.estimate =
        body.estimate === null || body.estimate === ""
          ? null
          : Number(body.estimate);
    if (body.spent !== undefined)
      data.spent =
        body.spent === null || body.spent === "" ? null : Number(body.spent);
    if (body.dueDate !== undefined)
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.startDate !== undefined)
      data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined)
      data.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.position !== undefined) data.position = Number(body.position);
    if (body.flexible !== undefined) data.flexible = !!body.flexible;

    const before = await prisma.task.findUnique({
      where: { id },
      include: { project: { select: { orgId: true } } },
    });
    if (!before) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // レビュー関連の遷移バリデーション
    const nextStatus =
      typeof data.status === "string" ? data.status : before.status;
    if (nextStatus !== before.status) {
      const nextReviewerId =
        body.reviewerId !== undefined
          ? body.reviewerId || null
          : before.reviewerId;
      const err = validateReviewTransition({
        from: before.status,
        to: nextStatus,
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
      // レビュー待ちに入るタイミングで依頼日時を更新
      if (nextStatus === "IN_REVIEW") data.reviewRequestedAt = new Date();
    }

    const task = await prisma.task.update({
      where: { id },
      data,
      include: { assignee: true, reviewer: true },
    });

    if (before.project.orgId) {
      const changed = Object.keys(data)
        .map((k) => TASK_FIELD_LABELS[k] ?? k)
        .join("・");
      await logActivity({
        orgId: before.project.orgId,
        actorId: userId,
        entity: "task",
        entityId: id,
        action: "update",
        summary: `タスク「${before.title}」を更新（${changed}）`,
        before: pickTaskSnapshot(before as unknown as Record<string, unknown>),
        after: pickTaskSnapshot(task as unknown as Record<string, unknown>),
      });

      // 通知はチェックボックスで明示された場合のみ（オプトイン）
      if (body.notify === true && task.status !== before.status) {
        const actor = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });
        await notifyReviewTransition({
          orgId: before.project.orgId,
          actorId: userId,
          actorName: actor?.name ?? actor?.email ?? "メンバー",
          task: {
            id: task.id,
            projectId: task.projectId,
            title: task.title,
            assigneeId: task.assigneeId,
            reviewerId: task.reviewerId,
          },
          from: before.status,
          to: task.status,
        });
      }
    }
    return NextResponse.json(task);
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
    if (!canEdit(await getTaskRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const before = await prisma.task.findUnique({
      where: { id },
      include: { project: { select: { orgId: true } } },
    });
    await prisma.task.delete({ where: { id } });
    if (before?.project.orgId) {
      await logActivity({
        orgId: before.project.orgId,
        actorId: userId,
        entity: "task",
        entityId: id,
        action: "delete",
        summary: `タスク「${before.title}」を削除`,
        before: pickTaskSnapshot(before as unknown as Record<string, unknown>),
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
