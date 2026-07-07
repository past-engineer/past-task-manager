"use client";

import { useEffect, useRef, useState } from "react";
import type {
  TaskDetail,
  TaskLite,
  MemberLite,
  CommentLite,
  AttachmentLite,
} from "@/lib/types";
import type { TaskStatus } from "@prisma/client";
import { STATUS_ORDER, STATUS_LABELS } from "@/lib/constants";
import Avatar from "@/components/Avatar";
import { DAY_MS, dayValue, fmtMD, weekdayOf } from "@/lib/dates";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function toDateInput(d: string | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default function TaskDetailModal({
  taskId,
  projectId,
  members,
  currentUserId,
  onClose,
  onChanged,
  onDeleted,
}: {
  taskId: string;
  projectId: string;
  members: MemberLite[];
  currentUserId: string;
  onClose: () => void;
  onChanged: (t: TaskLite) => void;
  onDeleted: (id: string) => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<{
    nonWorkingWeekdays: number[];
    dailyWorkHours: number;
  } | null>(null);
  const [editingHours, setEditingHours] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        if (s && Array.isArray(s.nonWorkingWeekdays)) setSettings(s);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/tasks/${taskId}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) {
          setTask(data);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  async function patch(data: Partial<TaskDetail>) {
    if (!task) return;
    const optimistic = { ...task, ...data };
    setTask(optimistic);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = (await res.json()) as TaskLite;
      onChanged({ ...updated, _count: task._count });
    }
  }

  async function addComment() {
    if (!commentText.trim() || !task) return;
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentText }),
    });
    if (res.ok) {
      const c = (await res.json()) as CommentLite;
      setTask({ ...task, comments: [...task.comments, c] });
      setCommentText("");
    }
  }

  async function addSubtask() {
    if (!subtaskTitle.trim() || !task) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        title: subtaskTitle,
        parentId: taskId,
        status: "TODO",
      }),
    });
    if (res.ok) {
      const st = (await res.json()) as TaskLite;
      setTask({ ...task, subtasks: [...task.subtasks, st] });
      setSubtaskTitle("");
    }
  }

  async function renameSubtask(id: string, title: string) {
    if (!title.trim()) return;
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function deleteSubtask(id: string) {
    if (!task) return;
    setTask({ ...task, subtasks: task.subtasks.filter((s) => s.id !== id) });
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  async function toggleSubtask(st: TaskLite) {
    if (!task) return;
    const next: TaskStatus = st.status === "DONE" ? "TODO" : "DONE";
    setTask({
      ...task,
      subtasks: task.subtasks.map((s) =>
        s.id === st.id ? { ...s, status: next } : s
      ),
    });
    await fetch(`/api/tasks/${st.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  async function uploadFile(file: File) {
    if (!task) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (res.ok) {
      const a = (await res.json()) as AttachmentLite;
      setTask({ ...task, attachments: [a, ...task.attachments] });
    } else {
      alert("アップロードに失敗しました（Blob未設定の可能性）");
    }
  }

  async function deleteAttachment(id: string) {
    if (!task) return;
    setTask({
      ...task,
      attachments: task.attachments.filter((a) => a.id !== id),
    });
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
  }

  async function remove() {
    if (!confirm("このタスクを削除しますか？")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    onDeleted(taskId);
  }

  async function saveDailyHour(dayMs: number, raw: string) {
    if (!task) return;
    const dateIso = new Date(dayMs).toISOString().slice(0, 10);
    const hours = raw === "" ? 0 : Number(raw);
    if (isNaN(hours) || hours < 0 || hours > 24) return;
    const res = await fetch(`/api/tasks/${taskId}/daily-hours`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateIso, hours }),
    });
    if (!res.ok) return;
    const others = task.dailyHours.filter(
      (h) => dayValue(h.date) !== dayMs
    );
    if (hours <= 0) {
      setTask({ ...task, dailyHours: others });
    } else {
      const rec = await res.json();
      setTask({ ...task, dailyHours: [...others, rec] });
    }
  }

  // 稼働時間の配分（フレキシブルモード）
  const defaultDaily =
    task?.assignee?.dailyCapacity ?? settings?.dailyWorkHours ?? 8;
  const offWeekdays = settings?.nonWorkingWeekdays ?? [0, 6];
  const spanS = task ? dayValue(task.startDate) : null;
  const spanE = task
    ? (dayValue(task.endDate) ?? dayValue(task.dueDate))
    : null;
  const workDays: number[] = [];
  if (task && spanS !== null && spanE !== null && spanE >= spanS) {
    for (let d = spanS; d <= spanE && workDays.length < 60; d += DAY_MS) {
      if (offWeekdays.length >= 7 || !offWeekdays.includes(weekdayOf(d)))
        workDays.push(d);
    }
  }
  const hoursByDay = new Map<number, number>();
  (task?.dailyHours ?? []).forEach((h) => {
    const d = dayValue(h.date);
    if (d !== null) hoursByDay.set(d, h.hours);
  });
  const totalHours = task?.flexible
    ? workDays.reduce((s, d) => s + (hoursByDay.get(d) ?? defaultDaily), 0)
    : defaultDaily * workDays.length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !task ? (
          <div className="p-10 text-center text-neutral-400">読み込み中…</div>
        ) : (
          <div className="flex flex-col">
            {/* header */}
            <div className="flex items-start justify-between gap-4 border-b border-neutral-100 p-5">
              <input
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                onBlur={(e) => patch({ title: e.target.value })}
                className="w-full rounded-md px-1 py-1 text-lg font-semibold text-neutral-900 outline-none hover:bg-neutral-50 focus:bg-neutral-50"
              />
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={remove}
                  className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-red-50 hover:text-red-500"
                >
                  削除
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-100"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:grid-cols-3">
              {/* main column */}
              <div className="space-y-5 sm:col-span-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-400">
                    内容
                  </label>
                  <textarea
                    value={task.description ?? ""}
                    onChange={(e) =>
                      setTask({ ...task, description: e.target.value })
                    }
                    onBlur={(e) => patch({ description: e.target.value })}
                    rows={4}
                    placeholder="詳細を入力…"
                    className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                  />
                </div>

                {/* subtasks */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    サブタスク（{task.subtasks.filter((s) => s.status === "DONE").length}/
                    {task.subtasks.length}）
                  </h3>
                  <div className="space-y-1">
                    {task.subtasks.map((st) => (
                      <div
                        key={st.id}
                        className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          checked={st.status === "DONE"}
                          onChange={() => toggleSubtask(st)}
                          className="h-4 w-4 shrink-0 rounded border-neutral-300"
                        />
                        <input
                          value={st.title}
                          onChange={(e) =>
                            setTask({
                              ...task,
                              subtasks: task.subtasks.map((s) =>
                                s.id === st.id
                                  ? { ...s, title: e.target.value }
                                  : s
                              ),
                            })
                          }
                          onBlur={(e) => renameSubtask(st.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.nativeEvent.isComposing
                            )
                              e.currentTarget.blur();
                          }}
                          className={`flex-1 rounded bg-transparent px-1 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-neutral-400 ${
                            st.status === "DONE"
                              ? "text-neutral-400 line-through"
                              : "text-neutral-700"
                          }`}
                        />
                        <button
                          onClick={() => deleteSubtask(st.id)}
                          className="invisible shrink-0 rounded px-1 text-xs text-neutral-300 hover:text-red-500 group-hover:visible"
                          title="サブタスクを削除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={subtaskTitle}
                      onChange={(e) => setSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing)
                          addSubtask();
                      }}
                      placeholder="+ サブタスクを追加"
                      className="flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                    />
                    <button
                      onClick={addSubtask}
                      className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200"
                    >
                      追加
                    </button>
                  </div>
                </div>

                {/* attachments */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    添付ファイル
                  </h3>
                  <div className="space-y-1">
                    {task.attachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-md border border-neutral-100 px-2 py-1.5"
                      >
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-sm text-neutral-800 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-800"
                        >
                          📎 {a.filename}
                        </a>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-400">
                            {fmtSize(a.size)}
                          </span>
                          <button
                            onClick={() => deleteAttachment(a.id)}
                            className="text-xs text-neutral-400 hover:text-red-500"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadFile(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="mt-2 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-900 disabled:opacity-50"
                  >
                    {uploading ? "アップロード中…" : "+ ファイルを追加"}
                  </button>
                </div>

                {/* comments */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    コメント
                  </h3>
                  <div className="space-y-3">
                    {task.comments.map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <Avatar user={c.author} size={28} />
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-neutral-700">
                              {c.author.name ?? c.author.email}
                            </span>
                            <span className="text-xs text-neutral-400">
                              {new Date(c.createdAt).toLocaleString("ja-JP")}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-neutral-600">
                            {c.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="コメントを追加…"
                      rows={2}
                      className="flex-1 resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                    />
                    <button
                      onClick={addComment}
                      disabled={!commentText.trim()}
                      className="self-end rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                    >
                      送信
                    </button>
                  </div>
                </div>
              </div>

              {/* side column */}
              <div className="space-y-4">
                <Field label="ステータス">
                  <select
                    value={task.status}
                    onChange={(e) =>
                      patch({ status: e.target.value as TaskStatus })
                    }
                    className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="担当者">
                  <select
                    value={task.assigneeId ?? ""}
                    onChange={(e) =>
                      patch({ assigneeId: e.target.value || null })
                    }
                    className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  >
                    <option value="">未割当</option>
                    {members.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name ?? m.user.email}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="見積(h)">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={task.estimate ?? ""}
                      onChange={(e) =>
                        setTask({
                          ...task,
                          estimate: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      onBlur={(e) =>
                        patch({
                          estimate: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                    />
                  </Field>
                  <Field label="実績(h)">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={task.spent ?? ""}
                      onChange={(e) =>
                        setTask({
                          ...task,
                          spent: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      onBlur={(e) =>
                        patch({
                          spent: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                    />
                  </Field>
                </div>

                {/* 稼働時間の配分 */}
                <div className="rounded-lg border border-neutral-200 p-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={task.flexible}
                      onChange={(e) => patch({ flexible: e.target.checked })}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                    フレキシブルモード
                  </label>
                  <p className="mt-1 text-[11px] leading-4 text-neutral-400">
                    {task.flexible
                      ? "日毎に稼働時間を設定できます"
                      : `1日 ${defaultDaily}h × 稼働日で割り当てます`}
                  </p>
                  {task.flexible && workDays.length === 0 && (
                    <p className="mt-2 text-xs text-neutral-400">
                      開始日と終了日（または期限）を設定してください
                    </p>
                  )}
                  {task.flexible && workDays.length > 0 && (
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                      {workDays.map((d) => (
                        <div
                          key={d}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-xs text-neutral-500">
                            {fmtMD(d)}（{WD[weekdayOf(d)]}）
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            value={
                              editingHours[d] ??
                              (hoursByDay.has(d)
                                ? String(hoursByDay.get(d))
                                : "")
                            }
                            placeholder={String(defaultDaily)}
                            onChange={(e) =>
                              setEditingHours((p) => ({
                                ...p,
                                [d]: e.target.value,
                              }))
                            }
                            onBlur={(e) => {
                              saveDailyHour(d, e.target.value);
                              setEditingHours((p) => {
                                const n = { ...p };
                                delete n[d];
                                return n;
                              });
                            }}
                            className="w-16 rounded-md border border-neutral-200 px-1.5 py-1 text-right text-xs outline-none focus:border-neutral-400"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {workDays.length > 0 && (
                    <p className="mt-2 text-xs text-neutral-500">
                      合計 {Math.round(totalHours * 10) / 10}h ／ 稼働日{" "}
                      {workDays.length}日
                    </p>
                  )}
                </div>

                <Field label="開始日">
                  <input
                    type="date"
                    value={toDateInput(task.startDate)}
                    onChange={(e) =>
                      patch({ startDate: e.target.value || null })
                    }
                    className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  />
                </Field>
                <Field label="終了日">
                  <input
                    type="date"
                    value={toDateInput(task.endDate)}
                    onChange={(e) => patch({ endDate: e.target.value || null })}
                    className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  />
                </Field>
                <Field label="期限">
                  <input
                    type="date"
                    value={toDateInput(task.dueDate)}
                    onChange={(e) => patch({ dueDate: e.target.value || null })}
                    className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  />
                </Field>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-400">
        {label}
      </label>
      {children}
    </div>
  );
}
