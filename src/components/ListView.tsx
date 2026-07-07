"use client";

import type { TaskLite, MemberLite } from "@/lib/types";
import type { TaskStatus } from "@prisma/client";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import Avatar from "@/components/Avatar";

function formatDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export default function ListView({
  tasks,
  members,
  onOpen,
  onPatch,
}: {
  tasks: TaskLite[];
  members: MemberLite[];
  onOpen: (id: string) => void;
  onPatch: (id: string, data: Partial<TaskLite>) => void;
}) {
  const sorted = [...tasks].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status);
    const sb = STATUS_ORDER.indexOf(b.status);
    if (sa !== sb) return sa - sb;
    return a.position - b.position;
  });

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
            <th className="px-4 py-2.5 font-medium">タスク</th>
            <th className="px-3 py-2.5 font-medium">ステータス</th>
            <th className="px-3 py-2.5 font-medium">担当</th>
            <th className="px-3 py-2.5 font-medium">工数</th>
            <th className="px-3 py-2.5 font-medium">期限</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-neutral-400">
                タスクがありません
              </td>
            </tr>
          )}
          {sorted.map((task) => {
            const assignee =
              task.assignee ??
              members.find((m) => m.user.id === task.assigneeId)?.user ??
              null;
            return (
              <tr
                key={task.id}
                className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
              >
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => onOpen(task.id)}
                    className="text-left font-medium text-neutral-800 hover:text-neutral-900"
                  >
                    {task.title}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={task.status}
                    onChange={(e) =>
                      onPatch(task.id, {
                        status: e.target.value as TaskStatus,
                      })
                    }
                    className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-400"
                    style={{ color: STATUS_COLORS[task.status] }}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {assignee && <Avatar user={assignee} size={20} />}
                    <select
                      value={task.assigneeId ?? ""}
                      onChange={(e) =>
                        onPatch(task.id, {
                          assigneeId: e.target.value || null,
                        })
                      }
                      className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-400"
                    >
                      <option value="">未割当</option>
                      {members.map((m) => (
                        <option key={m.user.id} value={m.user.id}>
                          {m.user.name ?? m.user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-neutral-500">
                  {task.estimate != null ? `${task.estimate}h` : "—"}
                </td>
                <td className="px-3 py-2.5 text-neutral-500">
                  {formatDate(task.dueDate) || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
