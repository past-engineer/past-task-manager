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
  parentId: string | null;
  assignee: UserLite | null;
  createdAt: string;
  updatedAt: string;
  _count?: { subtasks: number; comments: number; attachments: number };
};

export type MilestoneLite = {
  id: string;
  projectId: string;
  title: string;
  date: string;
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

export type TaskDetail = TaskLite & {
  subtasks: TaskLite[];
  comments: CommentLite[];
  attachments: AttachmentLite[];
  dailyHours: TaskDailyHoursLite[];
};
