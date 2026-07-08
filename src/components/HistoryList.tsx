"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import type { UserLite } from "@/lib/types";

export type ActivityItem = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  reverted: boolean;
  createdAt: string;
  actor: UserLite | null;
};

export default function HistoryList({
  logs,
  canRevert,
}: {
  logs: ActivityItem[];
  canRevert: boolean;
}) {
  const router = useRouter();
  const [reverting, setReverting] = useState(false);

  async function revert(log: ActivityItem, index: number) {
    // この履歴より新しい、未取り消しの変更数
    const count = logs
      .slice(0, index)
      .filter((l) => !l.reverted && l.action !== "revert").length;
    if (
      !confirm(
        `「${log.summary}」の時点に戻しますか？\nこれ以降の変更 ${count} 件が取り消されます。この操作は元に戻せません。`
      )
    )
      return;
    setReverting(true);
    const res = await fetch("/api/activity/revert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId: log.id }),
    });
    setReverting(false);
    if (res.ok) {
      const data = await res.json();
      alert(`${data.undone} 件の変更を取り消しました。`);
      router.refresh();
    } else {
      alert("巻き戻しに失敗しました");
    }
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-400">
        まだ変更履歴がありません
      </div>
    );
  }

  return (
    <div className="relative">
      {reverting && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 shadow-lg">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
            巻き戻し中…
          </div>
        </div>
      )}
      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
        {logs.map((log, index) => (
          <div
            key={log.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${
              log.reverted ? "opacity-40" : ""
            }`}
          >
            <Avatar user={log.actor} size={26} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-neutral-800">
                {log.summary}
              </p>
              <p className="text-xs text-neutral-400">
                {log.actor?.name ?? log.actor?.email ?? "（不明）"}・
                {new Date(log.createdAt).toLocaleString("ja-JP")}
              </p>
            </div>
            {log.reverted && (
              <span className="shrink-0 text-[11px] text-neutral-400">
                取消済み
              </span>
            )}
            {canRevert &&
              !log.reverted &&
              log.action !== "revert" &&
              index > 0 && (
                <button
                  onClick={() => revert(log, index)}
                  disabled={reverting}
                  className="shrink-0 rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-neutral-400 disabled:opacity-50"
                >
                  この時点に戻す
                </button>
              )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-neutral-400">
        ※「この時点に戻す」はその履歴より後の変更を逆適用します（管理者のみ）。プロジェクト削除の巻き戻しでは中のタスクまでは復元されません。
      </p>
    </div>
  );
}
