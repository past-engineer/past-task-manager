"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUndo, pickPrev } from "@/lib/useUndo";
import type { TaskLite, MemberLite, UserLite, DayOffLite } from "@/lib/types";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import TaskDetailModal from "@/components/TaskDetailModal";
import Avatar from "@/components/Avatar";
import {
  DAY_MS,
  buildRange,
  dayOfMonth,
  dayValue,
  countWorkingDays,
  fmtMD,
  isoOf,
  monthLabel,
  nextWorkingDay,
  prevWorkingDay,
  spanWorkingDays,
  todayMs,
  weekdayOf,
  type IsOffFn,
} from "@/lib/dates";

export type ScheduleTask = TaskLite & {
  project: { id: string; name: string; color: string };
};

const CELL = 28;
const LANE_H = 30;
const ROW_MIN_H = 44;
const ROW_PAD = 7;
const LEFT_W = 200;

type DragMode = "move" | "resize-l" | "resize-r";

type DragState = {
  id: string;
  mode: DragMode;
  originX: number;
  start: number;
  end: number;
  size: number; // 稼働日ベースのタスクサイズ
  delta: number;
  fromRow: number;
  targetRow: number;
  moved: boolean;
};

type PlacedTask = { task: ScheduleTask; lane: number; s: number; e: number };

type Row = {
  key: string;
  userId: string | null;
  user: UserLite | null;
  top: number;
  height: number;
  items: PlacedTask[];
  estimateSum: number;
};

export default function ScheduleBoard({
  tasks: initialTasks,
  people,
  daysOff,
  nonWorkingWeekdays,
  orgHolidays = [],
  membersByProject,
  currentUserId,
}: {
  tasks: ScheduleTask[];
  people: UserLite[];
  daysOff: DayOffLite[];
  nonWorkingWeekdays: number[];
  orgHolidays?: string[];
  membersByProject: Record<string, MemberLite[]>;
  currentUserId: string;
}) {
  const holidaySet = useMemo(
    () =>
      new Set(
        orgHolidays
          .map((d) => dayValue(d))
          .filter((d): d is number => d !== null)
      ),
    [orgHolidays]
  );
  const weekOff =
    nonWorkingWeekdays.length >= 7
      ? () => false
      : (d: number) => nonWorkingWeekdays.includes(weekdayOf(d));
  const isOffWeekday = (d: number) => weekOff(d) || holidaySet.has(d);
  const isOff = isOffWeekday;
  const [tasks, setTasks] = useState<ScheduleTask[]>(initialTasks);
  const [openTask, setOpenTask] = useState<ScheduleTask | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    task: ScheduleTask;
    x: number;
    y: number;
  } | null>(null);

  // ユーザーごとの非稼働日（日単位）
  const offByUser = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const d of daysOff) {
      const day = dayValue(d.date);
      if (day === null) continue;
      if (!map.has(d.userId)) map.set(d.userId, new Set());
      map.get(d.userId)!.add(day);
    }
    return map;
  }, [daysOff]);

  // 曜日＋そのユーザーの非稼働日を合わせた判定
  const isOffFor = useMemo(
    () =>
      (uid: string | null): IsOffFn =>
      (d: number) =>
        isOffWeekday(d) || (uid !== null && !!offByUser.get(uid)?.has(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offByUser, nonWorkingWeekdays, holidaySet]
  );

  const dated = useMemo(
    () =>
      tasks.filter(
        (t) =>
          dayValue(t.startDate) !== null ||
          dayValue(t.endDate) !== null ||
          dayValue(t.dueDate) !== null
      ),
    [tasks]
  );
  const undatedCount = tasks.length - dated.length;

  const range = useMemo(
    () =>
      buildRange(
        dated.flatMap((t) => [
          dayValue(t.startDate),
          dayValue(t.endDate),
          dayValue(t.dueDate),
        ])
      ),
    [dated]
  );
  const trackW = range.days.length * CELL;
  const today = todayMs();

  const months = useMemo(() => {
    const out: { label: string; count: number }[] = [];
    for (const d of range.days) {
      const label = monthLabel(d);
      const last = out[out.length - 1];
      if (last && last.label === label) last.count++;
      else out.push({ label, count: 1 });
    }
    return out;
  }, [range.days]);

  const rows = useMemo<Row[]>(() => {
    const defs: { key: string; userId: string | null; user: UserLite | null }[] =
      [
        ...people.map((u) => ({ key: u.id, userId: u.id, user: u })),
        { key: "__unassigned__", userId: null, user: null },
      ];
    let top = 0;
    return defs.map((def) => {
      const rowTasks = dated
        .filter((t) => t.assigneeId === def.userId)
        .map((t) => {
          const s0 = dayValue(t.startDate);
          const e0 = dayValue(t.endDate) ?? dayValue(t.dueDate);
          let s = (s0 ?? e0)!;
          let e = (e0 ?? s0)!;
          if (e < s) [s, e] = [e, s];
          return { task: t, s, e, lane: 0 };
        })
        .sort((a, b) => a.s - b.s || a.e - b.e);
      const laneEnds: number[] = [];
      for (const item of rowTasks) {
        let lane = laneEnds.findIndex((end) => item.s > end);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(item.e);
        } else {
          laneEnds[lane] = item.e;
        }
        item.lane = lane;
      }
      const height = Math.max(
        ROW_MIN_H,
        laneEnds.length * LANE_H + ROW_PAD * 2
      );
      const row: Row = {
        ...def,
        top,
        height,
        items: rowTasks,
        estimateSum: rowTasks.reduce(
          (sum, i) => sum + (i.task.estimate ?? 0),
          0
        ),
      };
      top += height;
      return row;
    });
  }, [dated, people]);

  const totalH = rows.reduce((s, r) => s + r.height, 0);

  const pushUndo = useUndo();
  const tasksStateRef = useRef(tasks);
  useEffect(() => {
    tasksStateRef.current = tasks;
  }, [tasks]);

  // 取り消し用（undo スタックには積まない）
  async function rawPatch(id: string, data: Partial<TaskLite>) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? ({ ...t, ...data } as ScheduleTask) : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function patch(id: string, data: Partial<TaskLite>) {
    const prev = tasksStateRef.current.find((t) => t.id === id);
    if (prev) {
      const prevData = pickPrev(prev as TaskLite, data);
      pushUndo(
        () => rawPatch(id, prevData),
        () => rawPatch(id, data)
      );
    }
    await rawPatch(id, data);
  }

  function rowIndexAtY(clientY: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const y = clientY - rect.top;
    for (let i = 0; i < rows.length; i++) {
      if (y < rows[i].top + rows[i].height) return i;
    }
    return rows.length - 1;
  }

  function startDrag(
    e: React.PointerEvent<HTMLElement>,
    item: PlacedTask,
    rowIndex: number,
    mode: DragMode
  ) {
    e.preventDefault();
    e.stopPropagation();
    setHover(null);
    const offFn = isOffFor(rows[rowIndex]?.userId ?? null);
    const st: DragState = {
      id: item.task.id,
      mode,
      originX: e.clientX,
      start: item.s,
      end: item.e,
      size: Math.max(1, countWorkingDays(item.s, item.e, offFn)),
      delta: 0,
      fromRow: rowIndex,
      targetRow: rowIndex,
      moved: false,
    };
    dragRef.current = st;
    setDrag(st);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<HTMLElement>) {
    const st = dragRef.current;
    if (!st) return;
    const dx = e.clientX - st.originX;
    const delta = Math.round(dx / CELL);
    const targetRow =
      st.mode === "move" ? rowIndexAtY(e.clientY) : st.targetRow;
    const moved = st.moved || Math.abs(dx) > 3 || targetRow !== st.fromRow;
    if (
      delta !== st.delta ||
      targetRow !== st.targetRow ||
      moved !== st.moved
    ) {
      const next = { ...st, delta, targetRow, moved };
      dragRef.current = next;
      setDrag(next);
    }
  }

  // ドラッグ中の開始/終了を、移動先メンバーの非稼働日を避けて解決
  function resolveDrag(st: DragState): { s: number; e: number } {
    const offFn = isOffFor(rows[st.targetRow]?.userId ?? null);
    const off = st.delta * DAY_MS;
    if (st.mode === "move") {
      const s = nextWorkingDay(st.start + off, offFn);
      return { s, e: spanWorkingDays(s, st.size, offFn) };
    }
    if (st.mode === "resize-l") {
      let s = nextWorkingDay(Math.min(st.start + off, st.end), offFn);
      if (s > st.end) s = st.end;
      return { s, e: st.end };
    }
    let e = prevWorkingDay(Math.max(st.end + off, st.start), offFn);
    if (e < st.start) e = st.start;
    return { s: st.start, e };
  }

  function endDrag(item: PlacedTask) {
    const st = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!st) return;
    if (!st.moved) {
      setOpenTask(item.task);
      return;
    }
    const { s, e: en } = resolveDrag(st);
    const data: Partial<TaskLite> = {};
    if (s !== st.start || en !== st.end) {
      data.startDate = isoOf(s);
      data.endDate = isoOf(en);
    }
    if (st.mode === "move" && st.targetRow !== st.fromRow) {
      const target = rows[st.targetRow];
      data.assigneeId = target.userId;
      data.assignee = target.user;
    }
    if (Object.keys(data).length > 0) patch(item.task.id, data);
  }

  function barStyle(item: PlacedTask, row: Row) {
    let { s, e } = item;
    let top = row.top + ROW_PAD + item.lane * LANE_H;
    const d = drag && drag.id === item.task.id ? drag : null;
    if (d) {
      ({ s, e } = resolveDrag(d));
      if (d.mode === "move" && d.targetRow !== d.fromRow)
        top = rows[d.targetRow].top + ROW_PAD;
    }
    return {
      left: ((s - range.min) / DAY_MS) * CELL + 1,
      width: Math.max(((e - s) / DAY_MS + 1) * CELL - 2, CELL - 2),
      top,
      height: LANE_H - 6,
      s,
      e,
    };
  }

  return (
    <div>
      <p className="mb-2 text-xs text-neutral-400">
        バー＝開始日〜終了日（横ドラッグで日程変更、縦ドラッグで担当変更、両端で伸縮）。赤いライン＝期限。日付が設定されたタスクのみ表示されます
        {undatedCount > 0 && `（日付未設定: ${undatedCount}件）`}。
      </p>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <div style={{ width: LEFT_W + trackW }}>
          {/* header */}
          <div className="flex border-b border-neutral-200">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-400"
              style={{ width: LEFT_W }}
            >
              メンバー
            </div>
            <div style={{ width: trackW }}>
              <div className="flex border-b border-neutral-100">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="truncate border-r border-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    style={{ width: m.count * CELL }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="flex">
                {range.days.map((d) => (
                  <div
                    key={d}
                    className={`shrink-0 py-0.5 text-center text-[10px] ${
                      d === today
                        ? "font-bold text-indigo-600"
                        : isOff(d)
                          ? "bg-neutral-50 text-neutral-300"
                          : "text-neutral-400"
                    }`}
                    style={{ width: CELL }}
                  >
                    {dayOfMonth(d)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* body */}
          <div className="flex">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-white"
              style={{ width: LEFT_W }}
            >
              {rows.map((row) => (
                <div
                  key={row.key}
                  className={`flex items-center gap-2 border-b border-neutral-100 px-3 ${
                    drag &&
                    drag.moved &&
                    drag.mode === "move" &&
                    rows[drag.targetRow].key === row.key
                      ? "bg-neutral-200/60"
                      : ""
                  }`}
                  style={{ height: row.height }}
                >
                  {row.user ? (
                    <>
                      <Avatar user={row.user} size={26} />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-neutral-700">
                          {row.user.name ?? row.user.email}
                        </p>
                        <p className="text-[10px] text-neutral-400">
                          {row.items.length}件
                          {row.estimateSum > 0 && ` / 見積${row.estimateSum}h`}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-400">
                      未割当（{row.items.length}件）
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div
              ref={trackRef}
              className="relative"
              style={{ width: trackW, height: totalH }}
            >
              {range.days.map((d, i) =>
                isOff(d) ? (
                  <div
                    key={d}
                    className="absolute bottom-0 top-0 bg-neutral-50"
                    style={{ left: i * CELL, width: CELL }}
                  />
                ) : null
              )}

              {/* メンバー別の非稼働日（該当行のみ網掛け） */}
              {rows.map((row) => {
                if (!row.userId) return null;
                return daysOff
                  .filter((d) => d.userId === row.userId)
                  .map((d) => {
                    const day = dayValue(d.date);
                    if (day === null || day < range.min || day > range.max)
                      return null;
                    return (
                      <div
                        key={`off-${d.id}`}
                        className="absolute z-[4] bg-neutral-300/40"
                        style={{
                          left: ((day - range.min) / DAY_MS) * CELL,
                          width: CELL,
                          top: row.top,
                          height: row.height,
                          backgroundImage:
                            "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(100,116,139,0.25) 4px, rgba(100,116,139,0.25) 6px)",
                        }}
                        title={`非稼働日 ${fmtMD(day)}${d.note ? `：${d.note}` : ""}`}
                      />
                    );
                  });
              })}
              <div
                className="absolute bottom-0 top-0 z-10 w-px bg-indigo-500"
                style={{
                  left: ((today - range.min) / DAY_MS) * CELL + CELL / 2,
                }}
              />
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="absolute left-0 right-0 border-b border-neutral-100"
                  style={{ top: row.top + row.height - 1 }}
                />
              ))}

              {/* due date markers */}
              {rows.map((row) =>
                row.items.map((item) => {
                  const due = dayValue(item.task.dueDate);
                  if (due === null || due < range.min || due > range.max)
                    return null;
                  const x = ((due - range.min) / DAY_MS + 1) * CELL - 1;
                  const laneTop = row.top + ROW_PAD + item.lane * LANE_H;
                  const sLeft = ((item.s - range.min) / DAY_MS) * CELL;
                  const eRight = ((item.e - range.min) / DAY_MS + 1) * CELL;
                  let conn: { left: number; width: number } | null = null;
                  if (x > eRight) conn = { left: eRight, width: x - eRight };
                  else if (x < sLeft) conn = { left: x, width: sLeft - x };
                  return (
                    <div key={`due-${item.task.id}`}>
                      {conn && (
                        <div
                          className="pointer-events-none absolute z-[5] border-t border-dashed border-red-400"
                          style={{
                            left: conn.left,
                            width: conn.width,
                            top: laneTop + (LANE_H - 6) / 2,
                          }}
                        />
                      )}
                      <div
                        className="pointer-events-none absolute z-20 w-0.5 rounded bg-red-500"
                        style={{
                          left: x,
                          top: laneTop - 2,
                          height: LANE_H - 2,
                        }}
                      />
                      <div
                        className="group absolute z-[5]"
                        style={{
                          left: x - 5,
                          width: 11,
                          top: laneTop - 2,
                          height: LANE_H - 2,
                        }}
                      >
                        <div className="pointer-events-none absolute -top-1 left-2 z-30 hidden whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white shadow group-hover:block">
                          期限 {fmtMD(due)}：{item.task.title}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {rows.map((row, rowIndex) =>
                row.items.map((item) => {
                  const { s: barS, e: barE, ...rect } = barStyle(item, row);
                  const dragging = drag?.id === item.task.id && drag.moved;
                  const offFn = isOffFor(
                    dragging && drag!.mode === "move"
                      ? (rows[drag!.targetRow]?.userId ?? null)
                      : row.userId
                  );
                  const offDays: number[] = [];
                  for (let d = barS; d <= barE; d += DAY_MS) {
                    if (offFn(d)) offDays.push(d);
                  }
                  return (
                    <div
                      key={item.task.id}
                      onPointerDown={(e) => startDrag(e, item, rowIndex, "move")}
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag(item)}
                      onMouseEnter={(e) => {
                        if (dragRef.current) return;
                        setHover({ task: item.task, x: e.clientX, y: e.clientY });
                      }}
                      onMouseMove={(e) => {
                        if (dragRef.current) return;
                        setHover({ task: item.task, x: e.clientX, y: e.clientY });
                      }}
                      onMouseLeave={() => setHover(null)}
                      className={`absolute z-10 flex cursor-grab touch-none items-center rounded-md px-2 text-xs font-medium text-white shadow-sm ${
                        dragging ? "z-20 opacity-80 ring-2 ring-neutral-400" : ""
                      } ${item.task.status === "DONE" ? "opacity-50" : ""}`}
                      style={{ ...rect, background: item.task.project.color }}
                    >
                      {/* 非稼働日部分を薄く */}
                      {offDays.map((d) => (
                        <span
                          key={d}
                          className="pointer-events-none absolute inset-y-0 bg-white/60"
                          style={{
                            left: ((d - barS) / DAY_MS) * CELL - 1,
                            width: CELL,
                          }}
                        />
                      ))}
                      <span
                        onPointerDown={(e) =>
                          startDrag(e, item, rowIndex, "resize-l")
                        }
                        onPointerMove={moveDrag}
                        onPointerUp={() => endDrag(item)}
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md hover:bg-black/20"
                      />
                      <span className="relative truncate">
                        {item.task.title}
                      </span>
                      <span
                        onPointerDown={(e) =>
                          startDrag(e, item, rowIndex, "resize-r")
                        }
                        onPointerMove={moveDrag}
                        onPointerUp={() => endDrag(item)}
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-black/20"
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {hover && !drag && (
        <div
          className="pointer-events-none fixed z-50 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-xl"
          style={{
            left: Math.min(
              hover.x + 14,
              (typeof window !== "undefined" ? window.innerWidth : 1200) - 280
            ),
            top:
              hover.y +
              (typeof window !== "undefined" && hover.y > window.innerHeight - 220
                ? -190
                : 16),
          }}
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: hover.task.project.color }}
            />
            <span className="truncate text-xs font-medium text-neutral-500">
              {hover.task.project.name}
            </span>
          </div>
          <p className="mb-2 text-sm font-semibold text-neutral-900">
            {hover.task.title}
          </p>
          <div className="space-y-1 text-xs text-neutral-600">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: STATUS_COLORS[hover.task.status] }}
              />
              {STATUS_LABELS[hover.task.status]}
              {hover.task.assignee && (
                <span className="text-neutral-400">
                  ／ {hover.task.assignee.name ?? hover.task.assignee.email}
                </span>
              )}
            </div>
            <p>
              期間:{" "}
              {hover.task.startDate
                ? new Date(hover.task.startDate).toLocaleDateString("ja-JP")
                : "未設定"}
              {" 〜 "}
              {hover.task.endDate
                ? new Date(hover.task.endDate).toLocaleDateString("ja-JP")
                : "未設定"}
            </p>
            <p>
              期限:{" "}
              {hover.task.dueDate ? (
                <span className="font-medium text-red-500">
                  {new Date(hover.task.dueDate).toLocaleDateString("ja-JP")}
                </span>
              ) : (
                "未設定"
              )}
            </p>
            {(hover.task.estimate !== null || hover.task.spent !== null) && (
              <p>
                工数: 見積 {hover.task.estimate ?? "-"}h ／ 実績{" "}
                {hover.task.spent ?? "-"}h
              </p>
            )}
          </div>
        </div>
      )}

      {openTask && (
        <TaskDetailModal
          taskId={openTask.id}
          projectId={openTask.projectId}
          members={membersByProject[openTask.projectId] ?? []}
          currentUserId={currentUserId}
          onClose={() => setOpenTask(null)}
          onChanged={(t) =>
            setTasks((prev) =>
              prev.map((old) =>
                old.id === t.id ? ({ ...old, ...t } as ScheduleTask) : old
              )
            )
          }
          onDeleted={(id) => {
            setTasks((prev) => prev.filter((t) => t.id !== id));
            setOpenTask(null);
          }}
        />
      )}
    </div>
  );
}
