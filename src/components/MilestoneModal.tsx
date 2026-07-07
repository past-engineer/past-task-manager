"use client";

import { useState } from "react";
import type { MilestoneLite } from "@/lib/types";

export default function MilestoneModal({
  projectId,
  milestone,
  onClose,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  milestone: MilestoneLite | null; // null = 新規作成
  onClose: () => void;
  onSaved: (m: MilestoneLite) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [date, setDate] = useState(
    milestone ? new Date(milestone.date).toISOString().slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !date || saving) return;
    setSaving(true);
    const res = milestone
      ? await fetch(`/api/milestones/${milestone.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, date }),
        })
      : await fetch(`/api/projects/${projectId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, date }),
        });
    setSaving(false);
    if (res.ok) {
      onSaved((await res.json()) as MilestoneLite);
      onClose();
    } else {
      alert("保存に失敗しました");
    }
  }

  async function remove() {
    if (!milestone) return;
    if (!confirm("このマイルストーンを削除しますか？")) return;
    const res = await fetch(`/api/milestones/${milestone.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onDeleted(milestone.id);
      onClose();
    } else {
      alert("削除に失敗しました");
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">
          {milestone ? "マイルストーンを編集" : "マイルストーンを追加"}
        </h2>
        <label className="mb-1 block text-sm font-medium text-neutral-600">
          タイトル
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
          }}
          placeholder="例: テストアップ、公開"
          className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <label className="mb-1 block text-sm font-medium text-neutral-600">
          日付
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-6 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <div className="flex items-center justify-between">
          {milestone ? (
            <button
              onClick={remove}
              className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              削除
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              キャンセル
            </button>
            <button
              onClick={save}
              disabled={saving || !title.trim() || !date}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
