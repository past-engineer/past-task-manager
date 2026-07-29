// レビューワークフローの通知（アプリ内＋メール）を一元管理する。
// ステータス変更はタスク詳細の PATCH とカンバン D&D（reorder）の2経路から
// 起きるため、通知の発行は必ずこのモジュールを経由させる。
//
// 通知はオプトイン方式：UI 側のチェックボックスで notify=true が明示された
// 場合のみ発行する（うっかりステータス変更で通知が飛ぶのを防ぐ）。
//
// 発行結果は NotifyOutcome として呼び出し元（APIレスポンス）に返し、
// UI が「送信されました」「メール送信失敗: 〜」を表示できるようにする。

import type { NotificationType, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail, appUrl } from "@/lib/mail";
import { isReviewTransition } from "@/lib/constants";
import type { NotifyOutcome } from "@/lib/types";

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
}): Promise<NotifyOutcome> {
  // 自分自身への通知は作らない（レビュアー＝担当者のケース）
  if (entry.userId === entry.actorId) {
    return {
      inApp: false,
      mailSent: false,
      skipped: "通知先が自分自身のため送信しませんでした",
    };
  }

  let inApp = false;
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
    inApp = true;
  } catch (e) {
    console.error("[notify] create failed", e);
  }

  const user = await prisma.user
    .findUnique({
      where: { id: entry.userId },
      select: { email: true },
    })
    .catch(() => null);
  if (!user?.email) {
    return {
      inApp,
      mailSent: false,
      mailSkipped: "受信者のメールアドレスが未登録",
    };
  }

  const link = appUrl(`/projects/${entry.task.projectId}?task=${entry.task.id}`);
  const result = await sendMail({
    to: user.email,
    subject: entry.emailSubject,
    text: `${entry.message}\n${link ? `\n▼ タスクを開く\n${link}\n` : ""}`,
  });

  return {
    inApp,
    mailSent: result.sent,
    mailSkipped: result.sent ? undefined : result.skipped,
    mailError: result.sent ? undefined : result.error,
  };
}

/**
 * ステータス変更に応じてレビュー関連の通知を発行する。
 * レビュー関連の遷移でなければ null を返す。
 */
export async function notifyReviewTransition(entry: {
  orgId: string;
  actorId: string;
  actorName: string;
  task: NotifyTaskInfo;
  from: TaskStatus;
  to: TaskStatus;
}): Promise<NotifyOutcome | null> {
  const kind = isReviewTransition(entry.from, entry.to);
  if (!kind) return null;
  const { task, actorName } = entry;

  if (kind === "request") {
    if (!task.reviewerId) {
      return {
        inApp: false,
        mailSent: false,
        skipped: "レビュー担当が未設定のため通知先がありません",
      };
    }
    return createNotification({
      orgId: entry.orgId,
      userId: task.reviewerId,
      actorId: entry.actorId,
      type: "REVIEW_REQUESTED",
      task,
      message: `${actorName}さんが「${task.title}」の${
        entry.from === "FEEDBACK" ? "再レビュー" : "レビュー"
      }を依頼しました`,
      emailSubject: `【past】レビュー依頼: ${task.title}`,
    });
  }

  if (!task.assigneeId) {
    return {
      inApp: false,
      mailSent: false,
      skipped: "担当者が未設定のため通知先がありません",
    };
  }

  if (kind === "approve") {
    return createNotification({
      orgId: entry.orgId,
      userId: task.assigneeId,
      actorId: entry.actorId,
      type: "REVIEW_APPROVED",
      task,
      message: `${actorName}さんが「${task.title}」を承認し、完了にしました`,
      emailSubject: `【past】レビュー承認: ${task.title}`,
    });
  }

  // feedback
  return createNotification({
    orgId: entry.orgId,
    userId: task.assigneeId,
    actorId: entry.actorId,
    type: "REVIEW_FEEDBACK",
    task,
    message: `${actorName}さんが「${task.title}」にFBを返しました`,
    emailSubject: `【past】FBが届きました: ${task.title}`,
  });
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
