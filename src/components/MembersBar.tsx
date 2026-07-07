"use client";

import { useState } from "react";
import type { MemberLite } from "@/lib/types";
import Avatar from "@/components/Avatar";

export default function MembersBar({
  projectId,
  members,
  canAdd = true,
  onAdd,
}: {
  projectId: string;
  members: MemberLite[];
  canAdd?: boolean;
  onAdd: (m: MemberLite) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!email.trim() || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSaving(false);
    if (res.ok) {
      const m = (await res.json()) as MemberLite;
      onAdd(m);
      setEmail("");
      setOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "追加に失敗しました");
    }
  }

  return (
    <div className="relative flex items-center">
      <div className="flex -space-x-2">
        {members.slice(0, 5).map((m) => (
          <Avatar key={m.id} user={m.user} size={28} />
        ))}
        {members.length > 5 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs text-neutral-500 ring-1 ring-white">
            +{members.length - 5}
          </span>
        )}
      </div>
      {canAdd && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-700"
          title="メンバーを追加"
        >
          +
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-9 z-30 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
          <label className="mb-1 block text-xs font-medium text-neutral-500">
            メールアドレスで追加
          </label>
          <input
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
            }}
            placeholder="member@example.com"
            className="mb-2 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          <p className="mb-2 text-xs text-neutral-400">
            ※ 相手が一度ログイン済みである必要があります
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
            >
              閉じる
            </button>
            <button
              onClick={add}
              disabled={saving}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
