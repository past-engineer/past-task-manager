"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import type { NotificationLite } from "@/lib/types";

const INTERVAL_MS = 30 * 1000;

const TYPE_ICONS: Record<NotificationLite["type"], string> = {
  REVIEW_REQUESTED: "👀",
  REVIEW_APPROVED: "✅",
  REVIEW_FEEDBACK: "📝",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationLite[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let stopped = false;

    async function load() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/notifications");
        if (res.ok && !stopped) {
          const data = await res.json();
          if (Array.isArray(data.items)) setItems(data.items);
          if (typeof data.unread === "number") setUnread(data.unread);
        }
      } catch {
        // オフライン時などは無視
      }
    }

    load();
    const timer = setInterval(load, INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setItems((prev) =>
      prev.map((n) =>
        ids.includes(n.id) && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n
      )
    );
    setUnread((prev) => {
      const affected = items.filter(
        (n) => ids.includes(n.id) && !n.readAt
      ).length;
      return Math.max(0, prev - affected);
    });
    await fetch("/api/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }

  async function markAllRead() {
    setItems((prev) =>
      prev.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() }
      )
    );
    setUnread(0);
    await fetch("/api/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  function openNotification(n: NotificationLite) {
    markRead([n.id]);
    setOpen(false);
    if (n.projectId && n.taskId) {
      router.push(`/projects/${n.projectId}?task=${n.taskId}`);
    } else if (n.projectId) {
      router.push(`/projects/${n.projectId}`);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="通知"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-30 w-80 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              通知
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-neutral-400 hover:text-neutral-800"
              >
                すべて既読にする
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-neutral-400">
                通知はありません
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-neutral-50 ${
                    n.readAt ? "opacity-60" : ""
                  }`}
                >
                  <span className="relative mt-0.5 shrink-0">
                    {n.actor ? (
                      <Avatar user={n.actor} size={28} />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-sm">
                        {TYPE_ICONS[n.type] ?? "🔔"}
                      </span>
                    )}
                    {!n.readAt && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white" />
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[13px] leading-5 text-neutral-700">
                      {TYPE_ICONS[n.type] ? `${TYPE_ICONS[n.type]} ` : ""}
                      {n.message}
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
