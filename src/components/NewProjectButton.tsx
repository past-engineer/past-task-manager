"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateLite } from "@/lib/types";

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#ef4444"];

export default function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [templates, setTemplates] = useState<TemplateLite[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || templates !== null) return;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
  }, [open, templates]);

  const selected = templates?.find((t) => t.id === templateId) ?? null;

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        color,
        templateId: templateId || null,
        startDate: templateId ? startDate || null : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const project = await res.json();
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/projects/${project.id}`);
    } else {
      alert("作成に失敗しました");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
      >
        + 新規プロジェクト
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
              新規プロジェクト
            </h2>
            <label className="mb-1 block text-sm font-medium text-neutral-600">
              プロジェクト名
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
              }}
              className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              placeholder="例: 新サービス開発"
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
              テンプレート
            </label>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const t = templates?.find((x) => x.id === e.target.value);
                if (t) setColor(t.color);
              }}
              className="mb-1 w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm outline-none focus:border-neutral-400"
            >
              <option value="">テンプレートなし（空のプロジェクト）</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（タスク{t.tasks.length}・MS{t.milestones.length}）
                </option>
              ))}
            </select>
            <p className="mb-3 text-xs text-neutral-400">
              {selected?.description ??
                "テンプレートは 設定 > プロジェクトテンプレート で編集できます"}
            </p>
            {templateId && (
              <>
                <label className="mb-1 block text-sm font-medium text-neutral-600">
                  開始日（タスク・マイルストーンの基準日）
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                />
              </>
            )}
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
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                キャンセル
              </button>
              <button
                onClick={submit}
                disabled={saving || !name.trim()}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
