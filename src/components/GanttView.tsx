"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TaskLite, MilestoneLite } from "@/lib/types";
import { STATUS_COLORS } from "@/lib/constants";
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
} from "@/lib/dates";

const CELL = 28;
const ROW_H = 40;
const LEFT_W = 240;

type DragMode = "move" | "resize-l" | "resize-r";

type DragState = {
  id: string;
  mode: DragMode;
  originX: number;
  start: number;
  end: number;
  size: number; // 稼働日ベースのタスクサイズ
  delta: number;
  moved: boolean;
};

type MsDrag = {
  id: string;
  originX: number;
  base: number;
  delta: number;
  moved: boolean;
};

export default function GanttView({
  tasks,
  milestones,
  nonWorkingWeekdays,
  orgHolidays = [],
  onOpen,
  onPatch,
  onMilestonePatch,
  onMilestoneOpen,
}: {
  tasks: TaskLite[];
  milestones: MilestoneLite[];
  nonWorkingWeekdays: number[];
  orgHolidays?: string[];
  onOpen: (id: string) => void;
  onPatch: (id: string, data: Partial<TaskLite>) => void;
  onMilestonePatch: (id: string, dateIso: string) => void;
  onMilestoneOpen: (m: MilestoneLite) => void;
}) {
  const holidaySet = new Set(
    orgHolidays.map((d) => dayValue(d)).filter((d): d is number => d !== null)
  );
  // 全曜日が非稼働なら曜日側は実質無効化（無限スキップ防止）
  const weekOff =
    nonWorkingWeekdays.length >= 7
      ? () => false
      : (d: number) => nonWorkingWeekdays.includes(weekdayOf(d));
  const isOff = (d: number) => weekOff(d) || holidaySet.has(d);

  // ドラッグ中の開始/終了を稼働日ベースで解決
  function resolveDrag(st: DragState): { s: number; e: number } {
    const off = st.delta * DAY_MS;
    if (st.mode === "move") {
      const s = nextWorkingDay(st.start + off, isOff);
      return { s, e: spanWorkingDays(s, st.size, isOff) };
    }
    if (st.mode === "resize-l") {
      let s = nextWorkingDay(Math.min(st.start + off, st.end), isOff);
      if (s > st.end) s = st.end;
      return { s, e: st.end };
    }
    let e = prevWorkingDay(Math.max(st.end + off, st.start), isOff);
    if (e < st.start) e = st.start;
    return { s: st.start, e };
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [msDrag, setMsDrag] = useState<MsDrag | null>(null);
  const msDragRef = useRef<MsDrag | null>(null);

  const range = useMemo(
    () =>
      buildRange([
        ...tasks.flatMap((t) => [
          dayValue(t.startDate),
          dayValue(t.endDate),
          dayValue(t.dueDate),
        ]),
        ...milestones.map((m) => dayValue(m.date)),
      ]),
    [tasks, milestones]
  );

  const trackW = range.days.length * CELL;
  const today = todayMs();

  // 初期表示は今日の位置へスクロール
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round((today - range.min) / DAY_MS);
    if (idx > 0) el.scrollLeft = Math.max(0, idx * CELL - CELL * 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function barGeometry(task: TaskLite) {
    const s0 = dayValue(task.startDate);
    const e0 = dayValue(task.endDate) ?? dayValue(task.dueDate);
    let s = s0 ?? e0;
    let e = e0 ?? s0;
    if (s === null || e === null) return null;
    if (e < s) [s, e] = [e, s];
    const d = drag && drag.id === task.id ? drag : null;
    if (d) ({ s, e } = resolveDrag(d));
    const left = ((s - range.min) / DAY_MS) * CELL;
    const width = ((e - s) / DAY_MS + 1) * CELL;
    return { left, width, s, e };
  }

  function startDrag(
    e: React.PointerEvent<HTMLElement>,
    task: TaskLite,
    mode: DragMode
  ) {
    e.preventDefault();
    e.stopPropagation();
    const s0 = dayValue(task.startDate);
    const e0 = dayValue(task.endDate) ?? dayValue(task.dueDate);
    let s = s0 ?? e0;
    let en = e0 ?? s0;
    if (s === null || en === null) return;
    if (en < s) [s, en] = [en, s];
    const st: DragState = {
      id: task.id,
      mode,
      originX: e.clientX,
      start: s,
      end: en,
      size: Math.max(1, countWorkingDays(s, en, isOff)),
      delta: 0,
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
    const moved = st.moved || Math.abs(dx) > 3;
    if (delta !== st.delta || moved !== st.moved) {
      const next = { ...st, delta, moved };
      dragRef.current = next;
      setDrag(next);
    }
  }

  function endDrag(task: TaskLite) {
    const st = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!st) return;
    if (!st.moved) {
      onOpen(task.id);
      return;
    }
    const { s, e: en } = resolveDrag(st);
    if (s !== st.start || en !== st.end) {
      onPatch(task.id, { startDate: isoOf(s), endDate: isoOf(en) });
    }
  }

  function startMsDrag(e: React.PointerEvent<HTMLElement>, m: MilestoneLite) {
    e.preventDefault();
    e.stopPropagation();
    const base = dayValue(m.date);
    if (base === null) return;
    const st: MsDrag = {
      id: m.id,
      originX: e.clientX,
      base,
      delta: 0,
      moved: false,
    };
    msDragRef.current = st;
    setMsDrag(st);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveMsDrag(e: React.PointerEvent<HTMLElement>) {
    const st = msDragRef.current;
    if (!st) return;
    const dx = e.clientX - st.originX;
    const delta = Math.round(dx / CELL);
    const moved = st.moved || Math.abs(dx) > 3;
    if (delta !== st.delta || moved !== st.moved) {
      const next = { ...st, delta, moved };
      msDragRef.current = next;
      setMsDrag(next);
    }
  }

  function endMsDrag(m: MilestoneLite) {
    const st = msDragRef.current;
    msDragRef.current = null;
    setMsDrag(null);
    if (!st) return;
    if (!st.moved) {
      onMilestoneOpen(m);
      return;
    }
    if (st.delta !== 0) {
      onMilestonePatch(m.id, isoOf(st.base + st.delta * DAY_MS));
    }
  }

  function scheduleAt(e: React.MouseEvent<HTMLElement>, task: TaskLite) {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = Math.max(
      0,
      Math.min(range.days.length - 1, Math.floor((e.clientX - rect.left) / CELL))
    );
    const day = nextWorkingDay(range.min + idx * DAY_MS, isOff);
    onPatch(task.id, { startDate: isoOf(day), endDate: isoOf(day) });
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-400">
        タスクがありません
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-neutral-400">
        バー＝開始日〜終了日（ドラッグで移動、両端で伸縮）。赤いライン＝期限。◆＝マイルストーン（ドラッグで移動、クリックで編集）。日付未設定のタスクは行内をクリックで設定できます。
      </p>
      <div
        ref={scrollRef}
        className="isolate max-h-[calc(100vh-250px)] min-h-[360px] overflow-x-auto overflow-y-auto rounded-xl border border-neutral-200 bg-white"
      >
        <div style={{ width: LEFT_W + trackW }}>
          {/* header */}
          <div className="sticky top-0 z-50 flex border-b border-neutral-200 bg-white">
            <div
              className="sticky left-0 z-40 shrink-0 border-r border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-400"
              style={{ width: LEFT_W }}
            >
              タスク
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
            {/* left labels */}
            <div
              className="sticky left-0 z-40 shrink-0 border-r border-neutral-200 bg-white"
              style={{ width: LEFT_W }}
            >
              {tasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  className="flex cursor-pointer items-center gap-2 border-b border-neutral-100 px-3 hover:bg-neutral-50"
                  style={{ height: ROW_H }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: STATUS_COLORS[t.status] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">
                    {t.title}
                  </span>
                  {t.assignee && <Avatar user={t.assignee} size={20} />}
                </div>
              ))}
            </div>

            {/* track */}
            <div
              className="relative"
              style={{ width: trackW, height: tasks.length * ROW_H }}
            >
              {/* non-working day + today overlays */}
              {range.days.map((d, i) =>
                isOff(d) ? (
                  <div
                    key={d}
                    className="absolute bottom-0 top-0 bg-neutral-50"
                    style={{ left: i * CELL, width: CELL }}
                  />
                ) : null
              )}
              <div
                className="absolute bottom-0 top-0 z-10 w-px bg-indigo-500"
                style={{ left: ((today - range.min) / DAY_MS) * CELL + CELL / 2 }}
              />
              {/* row separators */}
              {tasks.map((t, i) => (
                <div
                  key={t.id}
                  className="absolute left-0 right-0 border-b border-neutral-100"
                  style={{ top: (i + 1) * ROW_H - 1 }}
                />
              ))}

              {/* milestones */}
              {milestones.map((m) => {
                const base = dayValue(m.date);
                if (base === null) return null;
                const d =
                  msDrag && msDrag.id === m.id
                    ? base + msDrag.delta * DAY_MS
                    : base;
                if (d < range.min || d > range.max) return null;
                const x = ((d - range.min) / DAY_MS) * CELL + CELL / 2;
                const dragging = msDrag?.id === m.id && msDrag.moved;
                return (
                  <div key={`ms-${m.id}`}>
                    <div
                      className={`pointer-events-none absolute bottom-0 top-0 z-[6] w-0.5 ${
                        dragging ? "bg-violet-400" : "bg-violet-500/70"
                      }`}
                      style={{ left: x - 1 }}
                    />
                    <div
                      onPointerDown={(e) => startMsDrag(e, m)}
                      onPointerMove={moveMsDrag}
                      onPointerUp={() => endMsDrag(m)}
                      className="group absolute z-30 cursor-grab touch-none"
                      style={{ left: x - 7, top: 1, width: 14, height: 18 }}
                      title={`${m.title}（${fmtMD(d)}）`}
                    >
                      <span
                        className={`absolute left-[2px] top-[3px] block h-2.5 w-2.5 rotate-45 rounded-[2px] ${
                          dragging ? "bg-violet-400" : "bg-violet-600"
                        }`}
                      />
                      <span className="pointer-events-none absolute left-4 top-0 z-30 max-w-40 truncate whitespace-nowrap rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-90">
                        {m.title} {fmtMD(d)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* due date markers */}
              {tasks.map((t, i) => {
                const due = dayValue(t.dueDate);
                if (due === null || due < range.min || due > range.max)
                  return null;
                const x = ((due - range.min) / DAY_MS + 1) * CELL - 1;
                const geo = barGeometry(t);
                let conn: { left: number; width: number } | null = null;
                if (geo) {
                  const right = geo.left + geo.width;
                  if (x > right) conn = { left: right, width: x - right };
                  else if (x < geo.left)
                    conn = { left: x, width: geo.left - x };
                }
                return (
                  <div key={`due-${t.id}`}>
                    {conn && (
                      <div
                        className="pointer-events-none absolute z-[5] border-t border-dashed border-red-400"
                        style={{
                          left: conn.left,
                          width: conn.width,
                          top: i * ROW_H + ROW_H / 2,
                        }}
                      />
                    )}
                    <div
                      className="pointer-events-none absolute z-20 w-0.5 rounded bg-red-500"
                      style={{ left: x, top: i * ROW_H + 4, height: ROW_H - 8 }}
                    />
                    <div
                      className="group absolute z-[5]"
                      style={{
                        left: x - 5,
                        width: 11,
                        top: i * ROW_H,
                        height: ROW_H,
                      }}
                    >
                      <div className="pointer-events-none absolute -top-1 left-2 z-30 hidden whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white shadow group-hover:block">
                        期限 {fmtMD(due)}：{t.title}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* bars */}
              {tasks.map((t, i) => {
                const geo = barGeometry(t);
                if (!geo) {
                  return (
                    <div
                      key={t.id}
                      onClick={(e) => scheduleAt(e, t)}
                      className="group absolute left-0 right-0 cursor-copy"
                      style={{ top: i * ROW_H, height: ROW_H }}
                    >
                      <span className="ml-2 mt-2 hidden text-xs text-neutral-300 group-hover:inline-block">
                        クリックで日付を設定
                      </span>
                    </div>
                  );
                }
                const dragging = drag?.id === t.id && drag.moved;
                return (
                  <div
                    key={t.id}
                    onPointerDown={(e) => startDrag(e, t, "move")}
                    onPointerMove={moveDrag}
                    onPointerUp={() => endDrag(t)}
                    className={`absolute z-10 flex cursor-grab touch-none items-center rounded-md px-2 text-xs font-medium text-white shadow-sm ${
                      dragging ? "opacity-80 ring-2 ring-neutral-400" : ""
                    }`}
                    style={{
                      left: geo.left + 1,
                      width: Math.max(geo.width - 2, CELL - 2),
                      top: i * ROW_H + 7,
                      height: ROW_H - 14,
                      background: STATUS_COLORS[t.status],
                    }}
                    title={t.title}
                  >
                    {/* 非稼働日部分を薄く */}
                    {(() => {
                      const offs = [];
                      for (let d = geo.s; d <= geo.e; d += DAY_MS) {
                        if (isOff(d)) offs.push(d);
                      }
                      return offs.map((d) => (
                        <span
                          key={d}
                          className="pointer-events-none absolute inset-y-0 bg-white/60"
                          style={{
                            left: ((d - geo.s) / DAY_MS) * CELL - 1,
                            width: CELL,
                          }}
                        />
                      ));
                    })()}
                    <span
                      onPointerDown={(e) => startDrag(e, t, "resize-l")}
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag(t)}
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md hover:bg-black/20"
                    />
                    <span className="relative truncate">{t.title}</span>
                    <span
                      onPointerDown={(e) => startDrag(e, t, "resize-r")}
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag(t)}
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-black/20"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
