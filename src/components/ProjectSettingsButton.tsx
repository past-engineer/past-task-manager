"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#ef4444"];

export default function ProjectSettingsButton({
  projectId,
  name: initialName,
  description: initialDescription,
  color: initialColor,
}: {
  projectId: string;
  name: string;
  description: string | null;
  color: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      alert("保存に失敗しました");
    }
  }

  async function remove() {
    if (!confirm("このプロジェクトを削除しますか？（全タスクも削除されます）"))
      return;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/projects");
      router.refresh();
    } else {
      alert("削除できるのはオーナーのみです");
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setName(initialName);
          setDescription(initialDescription ?? "");
          setColor(initialColor);
          setOpen(true);
        }}
        className="rounded-md px-2 py-1 text-sm text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
        title="プロジェクト設定"
      >
        ⚙ 設定
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">
              プロジェクト設定
            </h2>
            <label className="mb-1 block text-sm font-medium text-neutral-600">
              プロジェクト名
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
              }}
              className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <label className="mb-1 block text-sm font-medium text-neutral-600">
              説明（任意）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mb-4 w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <label className="mb-1 block text-sm font-medium text-neutral-600">
              カラー
            </label>
            <div className="mb-6 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition ${
                    color === c ? "ring-2 ring-neutral-900 ring-offset-2" : ""
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={remove}
                className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50"
              >
                プロジェクトを削除
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
                >
                  キャンセル
                </button>
                <button
                  onClick={save}
                  disabled={saving || !name.trim()}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
