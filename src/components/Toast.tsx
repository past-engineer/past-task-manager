"use client";

import { useEffect } from "react";

export type ToastData = {
  message: string;
  kind: "success" | "error" | "info";
};

const KIND_STYLES: Record<ToastData["kind"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-neutral-200 bg-white text-neutral-700",
};

const KIND_ICONS: Record<ToastData["kind"], string> = {
  success: "✅",
  error: "⚠️",
  info: "ℹ️",
};

/** 画面下部に数秒表示される通知トースト（エラーは長めに表示） */
export default function Toast({
  toast,
  onClose,
}: {
  toast: ToastData;
  onClose: () => void;
}) {
  useEffect(() => {
    const ms = toast.kind === "error" ? 10000 : 4000;
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        className={`pointer-events-auto flex max-w-lg items-start gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
          KIND_STYLES[toast.kind]
        }`}
      >
        <span className="shrink-0">{KIND_ICONS[toast.kind]}</span>
        <span className="leading-5">{toast.message}</span>
        <button
          onClick={onClose}
          className="ml-1 shrink-0 opacity-50 transition hover:opacity-100"
          title="閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
