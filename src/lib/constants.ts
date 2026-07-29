import type { TaskStatus } from "@prisma/client";

export const STATUS_ORDER: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "FEEDBACK",
  "DONE",
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "未着手",
  IN_PROGRESS: "進行中",
  IN_REVIEW: "レビュー待ち",
  FEEDBACK: "FB対応",
  DONE: "完了",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  TODO: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  IN_REVIEW: "#f59e0b",
  FEEDBACK: "#ef4444",
  DONE: "#22c55e",
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && STATUS_ORDER.includes(v as TaskStatus);
}

/** サーバーが返すレビュー関連エラーの表示用メッセージ */
export const REVIEW_ERROR_MESSAGES: Record<string, string> = {
  REVIEWER_REQUIRED:
    "レビュー待ちにするには、先にレビュー担当を設定してください",
  REVIEWER_ONLY:
    "レビュー待ちからの承認・FBはレビュー担当（または管理者）のみ行えます",
};

/** レビュー関連の遷移か（通知確認 UI を出すか）の判定 */
export function isReviewTransition(
  from: TaskStatus,
  to: TaskStatus
): "request" | "approve" | "feedback" | null {
  if (from === to) return null;
  if (to === "IN_REVIEW") return "request";
  if (from === "IN_REVIEW" && to === "DONE") return "approve";
  if (from === "IN_REVIEW" && to === "FEEDBACK") return "feedback";
  return null;
}
