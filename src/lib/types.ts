import type { TaskStatus, Role } from "@prisma/client";

export type UserLite = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  dailyCapacity?: number | null;
};

export type TaskLite = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  estimate: number | null;
  spent: number | null;
  flexible: boolean;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  position: number;
  assigneeId: string | null;
  reviewerId: string | null;
  reviewRequestedAt: string | null;
  parentId: string | null;
  assignee: UserLite | null;
  reviewer?: UserLite | null;
  createdAt: string;
  updatedAt: string;
  _count?: { subtasks: number; comments: number; attachments: number };
};

export type OrgRoleStr = "ADMIN" | "MEMBER" | "VIEWER";

export type OrgMemberLite = {
  id: string;
  role: OrgRoleStr;
  user: UserLite;
};

export type FolderLite = {
  id: string;
  name: string;
  position: number;
  parentId: string | null;
  archived: boolean;
};

export type ProjectCardData = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  thumbnailUrl: string | null;
  folderId: string | null;
  archived: boolean;
  _count: { tasks: number; members: number };
  statusCounts: Record<string, number>;
};

export type TemplateTaskLite = {
  id?: string;
  title: string;
  estimate: number | null;
  startOffset: number | null;
  duration: number | null;
};

export type TemplateMilestoneLite = {
  id?: string;
  title: string;
  offset: number;
};

export type TemplateLite = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  tasks: TemplateTaskLite[];
  milestones: TemplateMilestoneLite[];
};

// 全メンバーの予定が埋まっている日の内訳
export type BusyDayInfo = {
  date: string;
  members: { name: string; items: string[] }[];
};

export type MilestoneLite = {
  id: string;
  projectId: string;
  title: string;
  date: string;
};

export type OrgHolidayLite = {
  id: string;
  orgId: string;
  date: string;
  note: string | null;
};

export type DayOffLite = {
  id: string;
  userId: string;
  date: string;
  note: string | null;
};

export type MemberLite = {
  id: string;
  role: Role;
  user: UserLite;
};

export type CommentLite = {
  id: string;
  body: string;
  createdAt: string;
  author: UserLite;
};

export type AttachmentLite = {
  id: string;
  filename: string;
  url: string;
  size: number;
  contentType: string | null;
  createdAt: string;
  uploader: UserLite;
};

export type TaskDailyHoursLite = {
  id: string;
  taskId: string;
  date: string;
  hours: number;
};

/** 通知発行の結果（UI で「送信されました／エラー」を表示するために API が返す） */
export type NotifyOutcome = {
  /** アプリ内通知を作成したか */
  inApp: boolean;
  /** メールを送信できたか */
  mailSent: boolean;
  /** メールを送らなかった理由（設定不足など） */
  mailSkipped?: string;
  /** メール送信を試みて失敗した理由 */
  mailError?: string;
  /** 通知自体を送らなかった理由（自分自身宛てなど） */
  skipped?: string;
};

export type NotificationLite = {
  id: string;
  type: "REVIEW_REQUESTED" | "REVIEW_APPROVED" | "REVIEW_FEEDBACK";
  taskId: string | null;
  projectId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
  actor: UserLite | null;
};

export type TaskDetail = TaskLite & {
  subtasks: TaskLite[];
  comments: CommentLite[];
  attachments: AttachmentLite[];
  dailyHours: TaskDailyHoursLite[];
};
