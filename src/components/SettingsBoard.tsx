"use client";

import { useState } from "react";
import type { DayOffLite, UserLite } from "@/lib/types";
import Avatar from "@/components/Avatar";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default function SettingsBoard({
  initialNonWorkingWeekdays,
  initialDailyWorkHours,
  people,
  initialDaysOff,
}: {
  initialNonWorkingWeekdays: number[];
  initialDailyWorkHours: number;
  people: UserLite[];
  initialDaysOff: DayOffLite[];
}) {
  const [nonWorking, setNonWorking] = useState<number[]>(
    initialNonWorkingWeekdays
  );
  const [savingWeekdays, setSavingWeekdays] = useState(false);
  const [dailyHours, setDailyHours] = useState(String(initialDailyWorkHours));
  const [hoursStatus, setHoursStatus] = useState<"" | "saving" | "saved">("");
  const [capacities, setCapacities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      people.map((u) => [u.id, u.dailyCapacity != null ? String(u.dailyCapacity) : ""])
    )
  );
  const [capStatus, setCapStatus] = useState<Record<string, string>>({});
  const [daysOff, setDaysOff] = useState<DayOffLite[]>(initialDaysOff);
  const [newDates, setNewDates] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);

  async function saveDailyHours() {
    const h = Number(dailyHours);
    if (isNaN(h) || h <= 0 || h > 24) {
      setDailyHours(String(initialDailyWorkHours));
      return;
    }
    setHoursStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyWorkHours: h }),
    });
    setHoursStatus(res.ok ? "saved" : "");
    if (!res.ok) alert("保存に失敗しました");
  }

  async function saveCapacity(userId: string) {
    const raw = capacities[userId] ?? "";
    if (raw !== "") {
      const h = Number(raw);
      if (isNaN(h) || h <= 0 || h > 24) return;
    }
    setCapStatus((p) => ({ ...p, [userId]: "保存中…" }));
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyCapacity: raw === "" ? null : Number(raw) }),
    });
    setCapStatus((p) => ({ ...p, [userId]: res.ok ? "保存済み" : "失敗" }));
  }

  async function toggleWeekday(day: number) {
    const next = nonWorking.includes(day)
      ? nonWorking.filter((d) => d !== day)
      : [...nonWorking, day].sort();
    setNonWorking(next);
    setSavingWeekdays(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonWorkingWeekdays: next }),
    });
    setSavingWeekdays(false);
    if (!res.ok) {
      setNonWorking(nonWorking); // 失敗時は戻す
      alert("保存に失敗しました");
    }
  }

  async function addDayOff(userId: string) {
    const date = newDates[userId];
    if (!date || adding) return;
    setAdding(userId);
    const res = await fetch("/api/days-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date }),
    });
    setAdding(null);
    if (res.ok) {
      const d = (await res.json()) as DayOffLite;
      setDaysOff((prev) =>
        [...prev.filter((x) => x.id !== d.id), d].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
      );
      setNewDates((prev) => ({ ...prev, [userId]: "" }));
    } else {
      alert("追加に失敗しました");
    }
  }

  async function removeDayOff(id: string) {
    setDaysOff((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/days-off/${id}`, { method: "DELETE" });
  }

  function fmt(date: string) {
    return new Date(date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      timeZone: "UTC",
    });
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* 非稼働曜日 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">非稼働曜日</h2>
        <p className="mb-4 text-sm text-neutral-500">
          チェックした曜日はガント・スケジュールで網掛け表示されます。
          {savingWeekdays && (
            <span className="ml-2 text-neutral-400">保存中…</span>
          )}
        </p>
        <div className="flex gap-2">
          {WEEKDAY_LABELS.map((label, day) => (
            <button
              key={day}
              onClick={() => toggleWeekday(day)}
              className={`h-10 w-10 rounded-lg border text-sm font-medium transition ${
                nonWorking.includes(day)
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 1日の稼働時間 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">1日の稼働時間</h2>
        <p className="mb-4 text-sm text-neutral-500">
          全体のデフォルト稼働時間です。タスクは基本的にこの時間で1日に割り当てられます。
          {hoursStatus === "saving" && (
            <span className="ml-2 text-neutral-400">保存中…</span>
          )}
          {hoursStatus === "saved" && (
            <span className="ml-2 text-neutral-400">保存済み</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            value={dailyHours}
            onChange={(e) => {
              setDailyHours(e.target.value);
              setHoursStatus("");
            }}
            onBlur={saveDailyHours}
            className="w-24 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
          <span className="text-sm text-neutral-500">時間 / 日</span>
        </div>
      </section>

      {/* メンバー別の非稼働日 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">
          メンバー別の設定
        </h2>
        <p className="mb-4 text-sm text-neutral-500">
          1日の稼働限界（未入力なら全体設定を使用。入力があればそちらが優先）と、休暇などの日単位の非稼働日を設定します。
        </p>
        <div className="space-y-5">
          {people.map((u) => {
            const list = daysOff.filter((d) => d.userId === u.id);
            return (
              <div key={u.id} className="border-t border-neutral-100 pt-4">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar user={u} size={26} />
                  <span className="text-sm font-medium text-neutral-700">
                    {u.name ?? u.email}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-neutral-500">
                    稼働限界
                    <input
                      type="number"
                      min="0.5"
                      max="24"
                      step="0.5"
                      value={capacities[u.id] ?? ""}
                      placeholder={`${initialDailyWorkHours}`}
                      onChange={(e) => {
                        setCapacities((p) => ({
                          ...p,
                          [u.id]: e.target.value,
                        }));
                        setCapStatus((p) => ({ ...p, [u.id]: "" }));
                      }}
                      onBlur={() => saveCapacity(u.id)}
                      className="w-16 rounded-md border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-neutral-400"
                    />
                    h/日
                    {capStatus[u.id] && (
                      <span className="text-neutral-400">
                        {capStatus[u.id]}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {list.length === 0 && (
                    <span className="text-xs text-neutral-400">
                      非稼働日はありません
                    </span>
                  )}
                  {list.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600"
                    >
                      {fmt(d.date)}
                      <button
                        onClick={() => removeDayOff(d.id)}
                        className="text-neutral-400 hover:text-red-500"
                        title="削除"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newDates[u.id] ?? ""}
                    onChange={(e) =>
                      setNewDates((prev) => ({
                        ...prev,
                        [u.id]: e.target.value,
                      }))
                    }
                    className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
                  />
                  <button
                    onClick={() => addDayOff(u.id)}
                    disabled={!newDates[u.id] || adding === u.id}
                    className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
                  >
                    追加
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
