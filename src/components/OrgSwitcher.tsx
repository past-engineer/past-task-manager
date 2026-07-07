"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OrgItem = {
  id: string;
  name: string;
  role: string;
  logoUrl?: string | null;
};

function OrgLogo({ org, size = 18 }: { org: OrgItem; size?: number }) {
  if (org.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={org.logoUrl}
        alt=""
        className="shrink-0 rounded object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded bg-neutral-900 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {org.name.charAt(0).toUpperCase()}
    </span>
  );
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理者",
  MEMBER: "参加者",
  VIEWER: "閲覧者",
};

export default function OrgSwitcher({
  orgs,
  currentOrgId,
}: {
  orgs: OrgItem[];
  currentOrgId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = orgs.find((o) => o.id === currentOrgId) ?? orgs[0];

  async function switchOrg(orgId: string) {
    setOpen(false);
    if (orgId === current?.id) return;
    await fetch("/api/orgs/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    router.refresh();
  }

  async function createOrg() {
    setOpen(false);
    const name = prompt("新しい組織の名前");
    if (!name?.trim()) return;
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
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

  if (!current) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1 text-[13px] text-neutral-700 transition hover:border-neutral-400"
        title="組織を切り替え"
      >
        <OrgLogo org={current} />
        <span className="max-w-32 truncate font-medium">{current.name}</span>
        <span className="text-[10px] text-neutral-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-30 w-56 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              組織を切り替え
            </p>
            {orgs.map((o) => (
              <button
                key={o.id}
                onClick={() => switchOrg(o.id)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-50 ${
                  o.id === current.id
                    ? "font-medium text-neutral-900"
                    : "text-neutral-600"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <OrgLogo org={o} size={16} />
                  <span className="truncate">{o.name}</span>
                </span>
                <span className="ml-2 shrink-0 text-[10px] text-neutral-400">
                  {ROLE_LABELS[o.role] ?? o.role}
                  {o.id === current.id && " ✓"}
                </span>
              </button>
            ))}
            <div className="my-1 border-t border-neutral-100" />
            <button
              onClick={createOrg}
              className="block w-full px-3 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-50"
            >
              + 新しい組織を作成
            </button>
          </div>
        </>
      )}
    </div>
  );
}
