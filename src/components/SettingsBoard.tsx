"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DayOffLite,
  OrgHolidayLite,
  OrgMemberLite,
  OrgRoleStr,
} from "@/lib/types";
import Avatar from "@/components/Avatar";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const ROLE_LABELS: Record<OrgRoleStr, string> = {
  ADMIN: "管理者",
  MEMBER: "参加者",
  VIEWER: "閲覧者",
};

export default function SettingsBoard({
  initialNonWorkingWeekdays,
  initialDailyWorkHours,
  initialOrgHolidays,
  orgMembers: initialOrgMembers,
  initialDaysOff,
  myUserId,
  myRole,
  initialLogoUrl = null,
}: {
  initialNonWorkingWeekdays: number[];
  initialDailyWorkHours: number;
  initialOrgHolidays: OrgHolidayLite[];
  orgMembers: OrgMemberLite[];
  initialDaysOff: DayOffLite[];
  myUserId: string;
  myRole: OrgRoleStr;
  initialLogoUrl?: string | null;
}) {
  const router = useRouter();
  const isAdmin = myRole === "ADMIN";

  const [orgMembers, setOrgMembers] =
    useState<OrgMemberLite[]>(initialOrgMembers);
  const [nonWorking, setNonWorking] = useState<number[]>(
    initialNonWorkingWeekdays
  );
  const [savingWeekdays, setSavingWeekdays] = useState(false);
  const [dailyHours, setDailyHours] = useState(String(initialDailyWorkHours));
  const [hoursStatus, setHoursStatus] = useState<"" | "saving" | "saved">("");
  const [capacities, setCapacities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialOrgMembers.map((m) => [
        m.user.id,
        m.user.dailyCapacity != null ? String(m.user.dailyCapacity) : "",
      ])
    )
  );
  const [capStatus, setCapStatus] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [holidays, setHolidays] =
    useState<OrgHolidayLite[]>(initialOrgHolidays);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayNote, setNewHolidayNote] = useState("");
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [daysOff, setDaysOff] = useState<DayOffLite[]>(initialDaysOff);
  const [newDates, setNewDates] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRoleStr>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  function canEditPerson(userId: string) {
    return isAdmin || (userId === myUserId && myRole !== "VIEWER");
  }

  async function toggleWeekday(day: number) {
    if (!isAdmin) return;
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
      setNonWorking(nonWorking);
      alert("保存に失敗しました");
    }
  }

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

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/orgs/logo", { method: "POST", body: fd });
    setLogoUploading(false);
    if (res.ok) {
      const data = await res.json();
      setLogoUrl(data.logoUrl);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "アップロードに失敗しました（Blob未設定の可能性）");
    }
  }

  async function removeLogo() {
    setLogoUrl(null);
    await fetch("/api/orgs/logo", { method: "DELETE" });
    router.refresh();
  }

  async function addHoliday() {
    if (!newHolidayDate || addingHoliday) return;
    setAddingHoliday(true);
    const res = await fetch("/api/org-holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: newHolidayDate,
        note: newHolidayNote.trim() || null,
      }),
    });
    setAddingHoliday(false);
    if (res.ok) {
      const h = (await res.json()) as OrgHolidayLite;
      setHolidays((prev) =>
        [...prev.filter((x) => x.id !== h.id), h].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
      );
      setNewHolidayDate("");
      setNewHolidayNote("");
    } else {
      alert("追加に失敗しました");
    }
  }

  async function removeHoliday(id: string) {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
    await fetch(`/api/org-holidays/${id}`, { method: "DELETE" });
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

  async function invite() {
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    setInviteError("");
    const res = await fetch("/api/orgs/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    setInviting(false);
    if (res.ok) {
      const m = (await res.json()) as OrgMemberLite;
      setOrgMembers((prev) => [...prev.filter((x) => x.id !== m.id), m]);
      setInviteEmail("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setInviteError(data.error ?? "招待に失敗しました");
    }
  }

  async function changeRole(memberId: string, role: OrgRoleStr) {
    const res = await fetch(`/api/orgs/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setOrgMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role } : m))
      );
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "変更に失敗しました");
    }
  }

  async function removeMember(m: OrgMemberLite) {
    if (
      !confirm(
        `${m.user.name ?? m.user.email} を組織から削除しますか？`
      )
    )
      return;
    const res = await fetch(`/api/orgs/members/${m.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setOrgMembers((prev) => prev.filter((x) => x.id !== m.id));
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "削除に失敗しました");
    }
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
    <div className="max-w-3xl space-y-8">
      {/* 組織ロゴ */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">組織ロゴ</h2>
        <p className="mb-4 text-sm text-neutral-500">
          ヘッダーの組織スイッチャーに表示されます。
          {!isAdmin && "変更は管理者のみ行えます。"}
        </p>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="組織ロゴ"
              className="h-14 w-14 rounded-lg border border-neutral-200 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">
              未設定
            </div>
          )}
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <input
                ref={logoFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => logoFileRef.current?.click()}
                disabled={logoUploading}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-400 disabled:opacity-50"
              >
                {logoUploading ? "アップロード中…" : "画像を選択（2MBまで）"}
              </button>
              {logoUrl && (
                <button
                  onClick={removeLogo}
                  className="rounded-md px-3 py-1 text-xs text-neutral-400 hover:text-red-500"
                >
                  削除
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* メンバー管理 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">メンバー管理</h2>
        <p className="mb-4 text-sm text-neutral-500">
          管理者＝すべて操作可能／参加者＝タスクの作成・編集が可能（組織設定は不可）／閲覧者＝閲覧のみ。
        </p>

        <div className="mb-4 divide-y divide-neutral-100">
          {orgMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar user={m.user} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800">
                  {m.user.name ?? m.user.email}
                  {m.user.id === myUserId && (
                    <span className="ml-1.5 text-xs text-neutral-400">
                      (自分)
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  {m.user.email}
                </p>
              </div>
              {isAdmin ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) =>
                      changeRole(m.id, e.target.value as OrgRoleStr)
                    }
                    className="rounded-md border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-neutral-400"
                  >
                    {(Object.keys(ROLE_LABELS) as OrgRoleStr[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeMember(m)}
                    className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-red-50 hover:text-red-500"
                    title="組織から削除"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
                  {ROLE_LABELS[m.role]}
                </span>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div>
            <div className="flex flex-wrap gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing)
                    invite();
                }}
                placeholder="member@example.com"
                className="min-w-52 flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRoleStr)}
                className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
              >
                {(Object.keys(ROLE_LABELS) as OrgRoleStr[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                onClick={invite}
                disabled={inviting || !inviteEmail.trim()}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                招待
              </button>
            </div>
            {inviteError && (
              <p className="mt-1.5 text-xs text-red-500">{inviteError}</p>
            )}
            <p className="mt-1.5 text-xs text-neutral-400">
              ※ 相手が一度ログイン済みである必要があります
            </p>
          </div>
        )}
      </section>

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
              disabled={!isAdmin}
              className={`h-10 w-10 rounded-lg border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                nonWorking.includes(day)
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 enabled:hover:bg-neutral-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 組織の非稼働日 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">
          組織の非稼働日
        </h2>
        <p className="mb-4 text-sm text-neutral-500">
          祝日や全社休業日など、組織全体で稼働しない特定の日を設定します。全メンバーのスケジュールに反映されます。
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {holidays.length === 0 && (
            <span className="text-xs text-neutral-400">
              非稼働日はありません
            </span>
          )}
          {holidays.map((h) => (
            <span
              key={h.id}
              className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600"
              title={h.note ?? undefined}
            >
              {fmt(h.date)}
              {h.note && (
                <span className="text-neutral-400">（{h.note}）</span>
              )}
              {isAdmin && (
                <button
                  onClick={() => removeHoliday(h.id)}
                  className="text-neutral-400 hover:text-red-500"
                  title="削除"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
            <input
              value={newHolidayNote}
              onChange={(e) => setNewHolidayNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  addHoliday();
              }}
              placeholder="メモ（例: 祝日、夏季休業）"
              className="w-52 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
            <button
              onClick={addHoliday}
              disabled={!newHolidayDate || addingHoliday}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
            >
              追加
            </button>
          </div>
        )}
      </section>

      {/* 1日の稼働時間 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">1日の稼働時間</h2>
        <p className="mb-4 text-sm text-neutral-500">
          組織のデフォルト稼働時間です。タスクは基本的にこの時間で1日に割り当てられます。
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
            disabled={!isAdmin}
            onChange={(e) => {
              setDailyHours(e.target.value);
              setHoursStatus("");
            }}
            onBlur={saveDailyHours}
            className="w-24 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-400"
          />
          <span className="text-sm text-neutral-500">時間 / 日</span>
        </div>
      </section>

      {/* メンバー別の設定 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">
          メンバー別の設定
        </h2>
        <p className="mb-4 text-sm text-neutral-500">
          1日の稼働限界（未入力なら組織設定を使用。入力があればそちらが優先）と、休暇などの日単位の非稼働日を設定します。
          {!isAdmin && "自分の設定のみ変更できます。"}
        </p>
        <div className="space-y-5">
          {orgMembers.map((m) => {
            const u = m.user;
            const editable = canEditPerson(u.id);
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
                      disabled={!editable}
                      onChange={(e) => {
                        setCapacities((p) => ({
                          ...p,
                          [u.id]: e.target.value,
                        }));
                        setCapStatus((p) => ({ ...p, [u.id]: "" }));
                      }}
                      onBlur={() => saveCapacity(u.id)}
                      className="w-16 rounded-md border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-400"
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
                      {editable && (
                        <button
                          onClick={() => removeDayOff(d.id)}
                          className="text-neutral-400 hover:text-red-500"
                          title="削除"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {editable && (
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
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
