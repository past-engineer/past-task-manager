"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import type { UserLite } from "@/lib/types";

const INTERVAL_MS = 60 * 1000;

export default function PresenceIndicator({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [online, setOnline] = useState<UserLite[]>([]);

  useEffect(() => {
    let stopped = false;

    async function beat() {
      if (document.hidden) return;
      try {
        await fetch("/api/presence", { method: "POST" });
        const res = await fetch("/api/presence");
        if (res.ok && !stopped) {
          const data = await res.json();
          if (Array.isArray(data)) setOnline(data);
        }
      } catch {
        // オフライン時などは無視
      }
    }

    beat();
    const timer = setInterval(beat, INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const others = online.filter((u) => u.id !== currentUserId);
  if (others.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5"
      title={`オンライン: ${others
        .map((u) => u.name ?? u.email)
        .join("、")}`}
    >
      <div className="flex -space-x-1.5">
        {others.slice(0, 5).map((u) => (
          <span key={u.id} className="relative inline-flex">
            <Avatar user={u} size={24} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
          </span>
        ))}
      </div>
      {others.length > 5 && (
        <span className="text-xs text-neutral-400">+{others.length - 5}</span>
      )}
    </div>
  );
}
