"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OrgCreatePrompt() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      const org = await res.json();
      await fetch("/api/orgs/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id }),
      });
      router.refresh();
    } else {
      alert("作成に失敗しました");
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center">
      <h2 className="mb-2 font-semibold text-neutral-900">
        組織に所属していません
      </h2>
      <p className="mb-6 text-sm text-neutral-500">
        新しい組織を作成するか、既存の組織の管理者に招待を依頼してください。
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) create();
          }}
          placeholder="組織名（例: past）"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <button
          onClick={create}
          disabled={saving || !name.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          作成
        </button>
      </div>
    </div>
  );
}
