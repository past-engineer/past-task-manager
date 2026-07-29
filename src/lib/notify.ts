// レビューワークフローの通知（アプリ内＋メール）を一元管理する。
// ステータス変更はタスク詳細の PATCH とカンバン D&D（reorder）の2経路から
// 起きるため、通知の発行は必ずこのモジュールを経由させる。
//
// 通知はオプトイン方式：UI 側のチェックボックスで notify=true が明示された
// 場合のみ発行する（うっかりステータス変更で通知が飛ぶのを防ぐ）。

import { after } from "next/server";
import type { NotificationType, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail, appUrl } from "@/lib/mail";
import { isReviewTransition } from "@/lib/constants";

type NotifyTaskInfo = {
  id: string;
  projectId: string;
  title: string;
  assigneeId: string | null;
  reviewerId: string | null;
};

async function createNotification(entry: {
  orgId: string;
  userId: string;
  actorId: string;
  type: NotificationType;
  task: NotifyTaskInfo;
  message: string;
  emailSubject: string;
}) {
  // 自分自身への通知は作らない（レビュアー＝担当者のケース）
  if (entry.userId === entry.actorId) return;

  try {
    await prisma.notification.create({
      data: {
        orgId: entry.orgId,
        userId: entry.userId,
        actorId: entry.actorId,
        type: entry.type,
        taskId: entry.task.id,
        projectId: entry.task.projectId,
        message: entry.message,
      },
    });
  } catch (e) {
    console.error("[notify] create failed", e);
  }

  // メールはレスポンス返却後に送信（API の応答速度に影響させない）
  const recipientId = entry.userId;
  const { message, emailSubject, task } = entry;
  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { email: true },
      });
      if (!user?.email) return;
      const link = appUrl(`/projects/${task.projectId}?task=${task.id}`);
      await sendMail({
        to: user.email,
        subject: emailSubject,
        text: `${message}\n${link ? `\n▼ タスクを開く\n${link}\n` : ""}`,
      });
    } catch (e) {
      console.error("[notify] mail failed", e);
    }
  });
}

/**
 * ステータス変更に応じてレビュー関連の通知を発行する。
 * notify=false（チェックボックス OFF）の場合は何もしない。
 */
export async function notifyReviewTransition(entry: {
  orgId: string;
  actorId: string;
  actorName: string;
  task: NotifyTaskInfo;
  from: TaskStatus;
  to: TaskStatus;
  /** FEEDBACK からの再依頼かどうか（文言の出し分け用） */
  reRequest?: boolean;
}) {
  const kind = isReviewTransition(entry.from, entry.to);
  if (!kind) return;
  const { task, actorName } = entry;

  if (kind === "request" && task.reviewerId) {
    await createNotification({
      orgId: entry.orgId,
      userId: task.reviewerId,
      actorId: entry.actorId,
      type: "REVIEW_REQUESTED",
      task,
      message: `${actorName}さんが「${task.title}」の${
        entry.reRequest || entry.from === "FEEDBACK" ? "再レビュー" : "レビュー"
      }を依頼しました`,
      emailSubject: `【past】レビュー依頼: ${task.title}`,
    });
  } else if (kind === "approve" && task.assigneeId) {
    await createNotification({
      orgId: entry.orgId,
      userId: task.assigneeId,
      actorId: entry.actorId,
      type: "REVIEW_APPROVED",
      task,
      message: `${actorName}さんが「${task.title}」を承認し、完了にしました`,
      emailSubject: `【past】レビュー承認: ${task.title}`,
    });
  } else if (kind === "feedback" && task.assigneeId) {
    await createNotification({
      orgId: entry.orgId,
      userId: task.assigneeId,
      actorId: entry.actorId,
      type: "REVIEW_FEEDBACK",
      task,
      message: `${actorName}さんが「${task.title}」にFBを返しました`,
      emailSubject: `【past】FBが届きました: ${task.title}`,
    });
  }
}

/**
 * レビュー関連遷移のバリデーション。
 * - IN_REVIEW へ移すにはレビュー担当が必要
 * - IN_REVIEW からの承認/FB はレビュー担当本人か組織 ADMIN のみ
 * 戻り値が null なら OK、文字列ならエラーコード。
 */
export function validateReviewTransition(entry: {
  from: TaskStatus;
  to: TaskStatus;
  reviewerId: string | null;
  actorId: string;
  isAdmin: boolean;
}): "REVIEWER_REQUIRED" | "REVIEWER_ONLY" | null {
  const kind = isReviewTransition(entry.from, entry.to);
  if (!kind) return null;
  if (kind === "request") {
    return entry.reviewerId ? null : "REVIEWER_REQUIRED";
  }
  // approve / feedback
  if (
    entry.reviewerId &&
    entry.reviewerId !== entry.actorId &&
    !entry.isAdmin
  ) {
    return "REVIEWER_ONLY";
  }
  return null;
}
