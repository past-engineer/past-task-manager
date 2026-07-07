"use client";

import type { TaskLite, MemberLite } from "@/lib/types";
import Avatar from "@/components/Avatar";

function formatDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function TaskCard({
  task,
  members,
  onOpen,
}: {
  task: TaskLite;
  members: MemberLite[];
  onOpen?: (id: string) => void;
}) {
  const assignee =
    task.assignee ??
    members.find((m) => m.user.id === task.assigneeId)?.user ??
    null;
  const due = formatDate(task.dueDate);
  const overdue =
    task.dueDate && task.status !== "DONE"
      ? new Date(task.dueDate) < new Date(new Date().toDateString())
      : false;

  return (
    <div
      onClick={() => onOpen?.(task.id)}
      className="cursor-pointer rounded-lg border border-neutral-200 bg-white p-3 transition hover:border-neutral-400"
    >
      <p className="mb-2 text-sm font-medium text-neutral-800">{task.title}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          {due && (
            <span
              className={`rounded px-1.5 py-0.5 ${
                overdue ? "bg-red-50 text-red-500" : "bg-neutral-100"
              }`}
            >
              {due}
            </span>
          )}
          {task.estimate != null && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5">
              {task.estimate}h
            </span>
          )}
          {task._count && task._count.subtasks > 0 && (
            <span title="サブタスク">☑ {task._count.subtasks}</span>
          )}
          {task._count && task._count.comments > 0 && (
            <span title="コメント">💬 {task._count.comments}</span>
          )}
          {task._count && task._count.attachments > 0 && (
            <span title="添付">📎 {task._count.attachments}</span>
          )}
        </div>
        {assignee && <Avatar user={assignee} size={22} />}
      </div>
    </div>
  );
}
