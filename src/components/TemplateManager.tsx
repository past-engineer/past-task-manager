"use client";

import { useState } from "react";
import type { TemplateLite } from "@/lib/types";

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#ef4444"];

export default function TemplateManager({
  initialTemplates,
  canManage,
}: {
  initialTemplates: TemplateLite[];
  canManage: boolean;
}) {
  const [templates, setTemplates] = useState<TemplateLite[]>(initialTemplates);
  const [editing, setEditing] = useState<TemplateLite | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const res = await fetch("/api/templates");
    if (res.ok) setTemplates(await res.json());
  }

  async function seed() {
    setSaving(true);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: true }),
    });
    setSaving(false);
    if (res.ok) await reload();
    else alert("作成に失敗しました");
  }

  async function createTemplate() {
    const name = prompt("テンプレート名");
    if (!name?.trim()) return;
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const t = (await res.json()) as TemplateLite;
      setTemplates((prev) => [...prev, t]);
      setEditing(JSON.parse(JSON.stringify(t)));
    } else {
      alert("作成に失敗しました");
    }
  }

  async function save() {
    if (!editing || saving) return;
    setSaving(true);
    const res = await fetch(`/api/templates/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    if (res.ok) {
      const t = (await res.json()) as TemplateLite;
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      setEditing(null);
    } else {
      alert("保存に失敗しました");
    }
  }

  async function remove(t: TemplateLite) {
    if (!confirm(`テンプレート「${t.name}」を削除しますか？`)) return;
    const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
    if (res.ok) setTemplates((prev) => prev.filter((x) => x.id !== t.id));
  }

  function patchEditing(data: Partial<TemplateLite>) {
    setEditing((prev) => (prev ? { ...prev, ...data } : prev));
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="mb-1 font-semibold text-neutral-900">
        プロジェクトテンプレート
      </h2>
      <p className="mb-4 text-sm text-neutral-500">
        新規プロジェクト作成時に選べる雛形です。タスクとマイルストーンを「開始日から◯日目」で定義します。
      </p>

      {templates.length === 0 ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-400">テンプレートがありません。</p>
          {canManage && (
            <button
              onClick={seed}
              disabled={saving}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              初期テンプレート（3種）を作成
            </button>
          )}
        </div>
      ) : (
        <div className="mb-4 divide-y divide-neutral-100">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: t.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800">
                  {t.name}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  タスク{t.tasks.length}・マイルストーン{t.milestones.length}
                  {t.description && `｜${t.description}`}
                </p>
              </div>
              {canManage && (
                <>
                  <button
                    onClick={() =>
                      setEditing(JSON.parse(JSON.stringify(t)))
                    }
                    className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-neutral-400"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-red-50 hover:text-red-500"
                    title="削除"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && templates.length > 0 && (
        <button
          onClick={createTemplate}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:border-neutral-400"
        >
          + テンプレートを追加
        </button>
      )}

      {/* 編集モーダル */}
      {editing && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-neutral-900">
              テンプレートを編集
            </h3>

            <label className="mb-1 block text-sm font-medium text-neutral-600">
              名前
            </label>
            <input
              value={editing.name}
              onChange={(e) => patchEditing({ name: e.target.value })}
              className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <label className="mb-1 block text-sm font-medium text-neutral-600">
              説明（任意）
            </label>
            <input
              value={editing.description ?? ""}
              onChange={(e) => patchEditing({ description: e.target.value })}
              className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <label className="mb-1 block text-sm font-medium text-neutral-600">
              カラー（プロジェクトの初期色）
            </label>
            <div className="mb-4 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => patchEditing({ color: c })}
                  className={`h-6 w-6 rounded-full transition ${
                    editing.color === c
                      ? "ring-2 ring-neutral-900 ring-offset-2"
                      : ""
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>

            {/* タスク */}
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-neutral-600">
                タスク
              </label>
              <span className="text-[11px] text-neutral-400">
                開始=開始日から◯日目 / 期間=日数 / 見積=時間
              </span>
            </div>
            <div className="mb-2 space-y-1.5">
              {editing.tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={t.title}
                    onChange={(e) =>
                      patchEditing({
                        tasks: editing.tasks.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x
                        ),
                      })
                    }
                    placeholder="タスク名"
                    className="min-w-0 flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  />
                  <input
                    type="number"
                    min="0"
                    value={t.startOffset ?? ""}
                    onChange={(e) =>
                      patchEditing({
                        tasks: editing.tasks.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                startOffset:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x
                        ),
                      })
                    }
                    placeholder="開始"
                    title="開始日から◯日目"
                    className="w-16 rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm outline-none focus:border-neutral-400"
                  />
                  <input
                    type="number"
                    min="1"
                    value={t.duration ?? ""}
                    onChange={(e) =>
                      patchEditing({
                        tasks: editing.tasks.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                duration:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x
                        ),
                      })
                    }
                    placeholder="期間"
                    title="期間（日）"
                    className="w-16 rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm outline-none focus:border-neutral-400"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={t.estimate ?? ""}
                    onChange={(e) =>
                      patchEditing({
                        tasks: editing.tasks.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                estimate:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x
                        ),
                      })
                    }
                    placeholder="見積"
                    title="見積（時間）"
                    className="w-16 rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm outline-none focus:border-neutral-400"
                  />
                  <button
                    onClick={() =>
                      patchEditing({
                        tasks: editing.tasks.filter((_, j) => j !== i),
                      })
                    }
                    className="shrink-0 px-1 text-neutral-300 hover:text-red-500"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                patchEditing({
                  tasks: [
                    ...editing.tasks,
                    {
                      title: "",
                      estimate: null,
                      startOffset: null,
                      duration: null,
                    },
                  ],
                })
              }
              className="mb-4 rounded-md border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400"
            >
              + タスク
            </button>

            {/* マイルストーン */}
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-neutral-600">
                マイルストーン
              </label>
              <span className="text-[11px] text-neutral-400">
                開始日から◯日目
              </span>
            </div>
            <div className="mb-2 space-y-1.5">
              {editing.milestones.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={m.title}
                    onChange={(e) =>
                      patchEditing({
                        milestones: editing.milestones.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x
                        ),
                      })
                    }
                    placeholder="例: テストアップ、公開"
                    className="min-w-0 flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  />
                  <input
                    type="number"
                    min="0"
                    value={m.offset}
                    onChange={(e) =>
                      patchEditing({
                        milestones: editing.milestones.map((x, j) =>
                          j === i
                            ? { ...x, offset: Number(e.target.value) || 0 }
                            : x
                        ),
                      })
                    }
                    title="開始日から◯日目"
                    className="w-16 rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm outline-none focus:border-neutral-400"
                  />
                  <button
                    onClick={() =>
                      patchEditing({
                        milestones: editing.milestones.filter(
                          (_, j) => j !== i
                        ),
                      })
                    }
                    className="shrink-0 px-1 text-neutral-300 hover:text-red-500"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                patchEditing({
                  milestones: [
                    ...editing.milestones,
                    { title: "", offset: 0 },
                  ],
                })
              }
              className="mb-6 rounded-md border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400"
            >
              + マイルストーン
            </button>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                キャンセル
              </button>
              <button
                onClick={save}
                disabled={saving || !editing.name.trim()}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
