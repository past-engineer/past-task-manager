"use client";

import { useState } from "react";
import type { UserLite } from "@/lib/types";

function initials(user?: Pick<UserLite, "name" | "email"> | null) {
  const base = user?.name || user?.email || "?";
  return base.trim().charAt(0).toUpperCase();
}

const COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

function colorFor(id?: string | null) {
  if (!id) return COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function Avatar({
  user,
  size = 24,
  title,
}: {
  user?: UserLite | null;
  size?: number;
  title?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const label = title ?? user?.name ?? user?.email ?? "未割当";

  if (user?.image && !imgError) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.image}
        alt={label}
        title={label}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="rounded-full object-cover ring-1 ring-white"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={label}
      className="inline-flex items-center justify-center rounded-full font-medium text-white ring-1 ring-white"
      style={{
        width: size,
        height: size,
        background: user ? colorFor(user.id) : "#cbd5e1",
        fontSize: size * 0.45,
      }}
    >
      {user ? initials(user) : "?"}
    </span>
  );
}
