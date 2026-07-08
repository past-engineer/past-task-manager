import { Prisma, type ActivityLog, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** JSON 保存できる形に変換（Date → ISO 文字列） */
function jsonable(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

/** 変更履歴を記録（失敗しても本処理は止めない） */
export async function logActivity(entry: {
  orgId: string;
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        orgId: entry.orgId,
        actorId: entry.actorId ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        summary: entry.summary,
        before: entry.before === undefined ? undefined : jsonable(entry.before),
        after: entry.after === undefined ? undefined : jsonable(entry.after),
      },
    });
  } catch (e) {
    console.error("[audit]", e);
  }
}

// スナップショット対象フィールド
const TASK_FIELDS = [
  "projectId",
  "parentId",
  "title",
  "description",
  "status",
  "estimate",
  "spent",
  "flexible",
  "startDate",
  "endDate",
  "dueDate",
  "position",
  "assigneeId",
] as const;

export function pickTaskSnapshot(t: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of TASK_FIELDS) out[k] = t[k] ?? null;
  return out;
}

export const TASK_FIELD_LABELS: Record<string, string> = {
  title: "タイトル",
  description: "内容",
  status: "ステータス",
  estimate: "見積",
  spent: "実績",
  flexible: "配分モード",
  startDate: "開始日",
  endDate: "終了日",
  dueDate: "期限",
  assigneeId: "担当",
  position: "並び順",
  projectId: "プロジェクト",
  parentId: "親タスク",
};

function reviveDates(
  o: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const r: Record<string, unknown> = { ...o };
  for (const k of keys) {
    if (typeof r[k] === "string") r[k] = new Date(r[k] as string);
  }
  return r;
}

/** 1件の履歴を逆適用する */
async function undoOne(log: ActivityLog) {
  const before = log.before as Record<string, unknown> | null;

  if (log.entity === "task") {
    if (log.action === "create") {
      await prisma.task.delete({ where: { id: log.entityId } });
    } else if (log.action === "update" && before) {
      await prisma.task.update({
        where: { id: log.entityId },
        data: reviveDates(before, [
          "startDate",
          "endDate",
          "dueDate",
        ]) as Prisma.TaskUncheckedUpdateInput,
      });
    } else if (log.action === "delete" && before) {
      await prisma.task.create({
        data: {
          id: log.entityId,
          ...(reviveDates(before, [
            "startDate",
            "endDate",
            "dueDate",
          ]) as unknown as Omit<Prisma.TaskUncheckedCreateInput, "id">),
        },
      });
    }
    return;
  }

  if (log.entity === "task-batch" && log.action === "update") {
    const items = (log.before ?? []) as {
      id: string;
      status: string;
      position: number;
    }[];
    for (const item of items) {
      await prisma.task
        .update({
          where: { id: item.id },
          data: {
            status: item.status as TaskStatus,
            position: item.position,
          },
        })
        .catch(() => {});
    }
    return;
  }

  if (log.entity === "milestone") {
    if (log.action === "create") {
      await prisma.milestone.delete({ where: { id: log.entityId } });
    } else if (log.action === "update" && before) {
      await prisma.milestone.update({
        where: { id: log.entityId },
        data: reviveDates(before, [
          "date",
        ]) as Prisma.MilestoneUncheckedUpdateInput,
      });
    } else if (log.action === "delete" && before) {
      await prisma.milestone.create({
        data: {
          id: log.entityId,
          ...(reviveDates(before, ["date"]) as unknown as Omit<
            Prisma.MilestoneUncheckedCreateInput,
            "id"
          >),
        },
      });
    }
    return;
  }

  if (log.entity === "project") {
    if (log.action === "create") {
      await prisma.project.delete({ where: { id: log.entityId } });
    } else if (log.action === "update" && before) {
      await prisma.project.update({
        where: { id: log.entityId },
        data: before as Prisma.ProjectUncheckedUpdateInput,
      });
    } else if (log.action === "delete" && before) {
      await prisma.project.create({
        data: {
          id: log.entityId,
          ...(before as unknown as Omit<
            Prisma.ProjectUncheckedCreateInput,
            "id"
          >),
        },
      });
    }
    return;
  }
}

/** 指定の履歴の「直後」の状態まで戻す（それより新しい変更を逆適用） */
export async function revertToLog(
  orgId: string,
  logId: string,
  actorId: string
): Promise<{ undone: number } | { error: string }> {
  const target = await prisma.activityLog.findFirst({
    where: { id: logId, orgId },
  });
  if (!target) return { error: "NOT_FOUND" };

  const newer = await prisma.activityLog.findMany({
    where: {
      orgId,
      createdAt: { gt: target.createdAt },
      reverted: false,
      action: { not: "revert" },
    },
    orderBy: { createdAt: "desc" },
  });

  let undone = 0;
  for (const log of newer) {
    try {
      await undoOne(log);
      undone++;
    } catch (e) {
      console.error("[revert] skip", log.id, e);
    }
    await prisma.activityLog
      .update({ where: { id: log.id }, data: { reverted: true } })
      .catch(() => {});
  }

  await logActivity({
    orgId,
    actorId,
    entity: "system",
    entityId: target.id,
    action: "revert",
    summary: `「${target.summary}」の時点へ戻しました（${undone}件を取り消し）`,
  });

  return { undone };
}
