"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#ef4444"];

export default function ProjectSettingsButton({
  projectId,
  name: initialName,
  description: initialDescription,
  color: initialColor,
  thumbnailUrl: initialThumbnail = null,
}: {
  projectId: string;
  name: string;
  description: string | null;
  color: string;
  thumbnailUrl?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [color, setColor] = useState(initialColor);
  const [thumbnail, setThumbnail] = useState<string | null>(initialThumbnail);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadThumbnail(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/thumbnail`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (res.ok) {
      const data = await res.json();
      setThumbnail(data.thumbnailUrl);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "アップロードに失敗しました（Blob未設定の可能性）");
    }
  }

  async function removeThumbnail() {
    setThumbnail(null);
    await fetch(`/api/projects/${projectId}/thumbnail`, { method: "DELETE" });
    router.refresh();
  }

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
              サムネイル
            </label>
            <div className="mb-4 flex items-center gap-3">
              {thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnail}
                  alt="サムネイル"
                  className="h-16 w-28 rounded-md border border-neutral-200 object-cover"
                />
              ) : (
                <div className="flex h-16 w-28 items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400">
                  未設定
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadThumbnail(f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-400 disabled:opacity-50"
                >
                  {uploading ? "アップロード中…" : "画像を選択（4MBまで）"}
                </button>
                {thumbnail && (
                  <button
                    onClick={removeThumbnail}
                    className="rounded-md px-3 py-1 text-xs text-neutral-400 hover:text-red-500"
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
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
