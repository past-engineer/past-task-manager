"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUndo, pickPrev } from "@/lib/useUndo";
import type { TaskLite, MemberLite, MilestoneLite } from "@/lib/types";
import { STATUS_COLORS } from "@/lib/constants";
import Avatar from "@/components/Avatar";
import TaskDetailModal from "@/components/TaskDetailModal";
import MilestoneModal from "@/components/MilestoneModal";
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

export type GanttTask = TaskLite & {
  project: { id: string; name: string; color: string };
};

type ProjectLite = { id: string; name: string; color: string };

const CELL = 28;
const ROW_H = 40;
const PROJECT_H = 34;
const LEFT_W = 260;

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

type Row =
  | { kind: "project"; project: ProjectLite; top: number; height: number }
  | { kind: "task"; task: GanttTask; top: number; height: number };

type MsDrag = {
  id: string;
  originX: number;
  base: number;
  delta: number;
  moved: boolean;
};

export default function AllProjectsGantt({
  projects,
  tasks: initialTasks,
  milestones: initialMilestones,
  nonWorkingWeekdays,
  orgHolidays = [],
  membersByProject,
  currentUserId,
}: {
  projects: ProjectLite[];
  tasks: GanttTask[];
  milestones: MilestoneLite[];
  nonWorkingWeekdays: number[];
  orgHolidays?: string[];
  membersByProject: Record<string, MemberLite[]>;
  currentUserId: string;
}) {
  const holidaySet = new Set(
    orgHolidays.map((d) => dayValue(d)).filter((d): d is number => d !== null)
  );
  const weekOff =
    nonWorkingWeekdays.length >= 7
      ? () => false
      : (d: number) => nonWorkingWeekdays.includes(weekdayOf(d));
  const isOff = (d: number) => weekOff(d) || holidaySet.has(d);

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
  const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
  const [milestones, setMilestones] =
    useState<MilestoneLite[]>(initialMilestones);
  const [openTask, setOpenTask] = useState<GanttTask | null>(null);
  const [msModal, setMsModal] = useState<MilestoneLite | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [msDrag, setMsDrag] = useState<MsDrag | null>(null);
  const msDragRef = useRef<MsDrag | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(true);

  useEffect(() => {
    const v = window.localStorage.getItem("ptm-gantt-show-done");
    if (v === "0") setShowDone(false);
  }, []);

  function toggleShowDone() {
    setShowDone((prev) => {
      window.localStorage.setItem("ptm-gantt-show-done", prev ? "0" : "1");
      return !prev;
    });
  }

  const visibleTasks = useMemo(
    () => (showDone ? tasks : tasks.filter((t) => t.status !== "DONE")),
    [tasks, showDone]
  );

  function toggleProject(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const range = useMemo(
    () =>
      buildRange([
        ...visibleTasks.flatMap((t) => [
          dayValue(t.startDate),
          dayValue(t.endDate),
          dayValue(t.dueDate),
        ]),
        ...milestones.map((m) => dayValue(m.date)),
      ]),
    [visibleTasks, milestones]
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

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let top = 0;
    for (const p of projects) {
      out.push({ kind: "project", project: p, top, height: PROJECT_H });
      top += PROJECT_H;
      if (collapsed.has(p.id)) continue;
      for (const t of visibleTasks) {
        if (t.projectId !== p.id) continue;
        out.push({ kind: "task", task: t, top, height: ROW_H });
        top += ROW_H;
      }
    }
    return out;
  }, [projects, visibleTasks, collapsed]);

  const totalH = rows.reduce((s, r) => s + r.height, 0);

  // プロジェクトごとのグループ範囲（見出し行＋配下タスク行）
  const groupBounds = useMemo(() => {
    const map = new Map<string, { top: number; height: number }>();
    let current: string | null = null;
    let start = 0;
    let acc = 0;
    for (const r of rows) {
      if (r.kind === "project") {
        if (current) map.set(current, { top: start, height: acc });
        current = r.project.id;
        start = r.top;
        acc = r.height;
      } else {
        acc += r.height;
      }
    }
    if (current) map.set(current, { top: start, height: acc });
    return map;
  }, [rows]);

  // プロジェクトごとの期間サマリー（見出し行に薄く表示）
  // タスクの期間に加えて、期限・マイルストーンの日付も範囲に含める
  const projectSpans = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    const extend = (projectId: string, lo: number | null, hi: number | null) => {
      if (lo === null || hi === null) return;
      const cur = map.get(projectId);
      map.set(projectId, {
        min: cur ? Math.min(cur.min, lo) : lo,
        max: cur ? Math.max(cur.max, hi) : hi,
      });
    };
    for (const t of visibleTasks) {
      const s0 = dayValue(t.startDate);
      const e0 = dayValue(t.endDate) ?? dayValue(t.dueDate);
      extend(t.projectId, s0 ?? e0, e0 ?? s0);
      const due = dayValue(t.dueDate);
      extend(t.projectId, due, due);
    }
    for (const m of milestones) {
      const d = dayValue(m.date);
      extend(m.projectId, d, d);
    }
    return map;
  }, [visibleTasks, milestones]);

  const pushUndo = useUndo();
  const tasksStateRef = useRef(tasks);
  const milestonesStateRef = useRef(milestones);
  useEffect(() => {
    tasksStateRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    milestonesStateRef.current = milestones;
  }, [milestones]);

  // 取り消し用（undo スタックには積まない）
  async function rawPatch(id: string, data: Partial<TaskLite>) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? ({ ...t, ...data } as GanttTask) : t))
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

  function barGeometry(task: GanttTask) {
    const s0 = dayValue(task.startDate);
    const e0 = dayValue(task.endDate) ?? dayValue(task.dueDate);
    let s = s0 ?? e0;
    let e = e0 ?? s0;
    if (s === null || e === null) return null;
    if (e < s) [s, e] = [e, s];
    const d = drag && drag.id === task.id ? drag : null;
    if (d) ({ s, e } = resolveDrag(d));
    return {
      left: ((s - range.min) / DAY_MS) * CELL,
      width: ((e - s) / DAY_MS + 1) * CELL,
      s,
      e,
    };
  }

  function startDrag(
    e: React.PointerEvent<HTMLElement>,
    task: GanttTask,
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

  function endDrag(task: GanttTask) {
    const st = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!st) return;
    if (!st.moved) {
      setOpenTask(task);
      return;
    }
    const { s, e: en } = resolveDrag(st);
    if (s !== st.start || en !== st.end) {
      patch(task.id, { startDate: isoOf(s), endDate: isoOf(en) });
    }
  }

  async function rawPatchMilestone(id: string, dateIso: string) {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, date: dateIso } : m))
    );
    await fetch(`/api/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateIso }),
    });
  }

  async function patchMilestone(id: string, dateIso: string) {
    const prev = milestonesStateRef.current.find((m) => m.id === id);
    if (prev) {
      const prevDate = prev.date.slice(0, 10);
      pushUndo(
        () => rawPatchMilestone(id, prevDate),
        () => rawPatchMilestone(id, dateIso)
      );
    }
    await rawPatchMilestone(id, dateIso);
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
      setMsModal(m);
      return;
    }
    if (st.delta !== 0) {
      patchMilestone(m.id, isoOf(st.base + st.delta * DAY_MS));
    }
  }

  function scheduleAt(e: React.MouseEvent<HTMLElement>, task: GanttTask) {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = Math.max(
      0,
      Math.min(
        range.days.length - 1,
        Math.floor((e.clientX - rect.left) / CELL)
      )
    );
    const day = nextWorkingDay(range.min + idx * DAY_MS, isOff);
    patch(task.id, { startDate: isoOf(day), endDate: isoOf(day) });
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-400">
        プロジェクトがありません
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-4">
        <p className="text-xs text-neutral-400">
          バー＝開始日〜終了日（ドラッグで移動、両端で伸縮）。赤いライン＝期限。◆＝マイルストーン（ドラッグで移動、クリックで編集。追加は各プロジェクトのガント画面から）。日付未設定のタスクは行内をクリックで設定できます。
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <label className="mr-2 flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={showDone}
              onChange={toggleShowDone}
              className="h-3.5 w-3.5 rounded border-neutral-300"
            />
            完了を表示
          </label>
          <button
            onClick={() => setCollapsed(new Set(projects.map((p) => p.id)))}
            className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-neutral-400"
          >
            すべて折りたたむ
          </button>
          <button
            onClick={() => setCollapsed(new Set())}
            className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-neutral-400"
          >
            すべて展開
          </button>
        </div>
      </div>
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
              プロジェクト / タスク
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
              {rows.map((row) =>
                row.kind === "project" ? (
                  <button
                    key={`p-${row.project.id}`}
                    onClick={() => toggleProject(row.project.id)}
                    className="flex w-full items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 text-left hover:bg-neutral-100"
                    style={{ height: row.height }}
                    title={
                      collapsed.has(row.project.id) ? "展開" : "折りたたむ"
                    }
                  >
                    <span
                      className={`inline-block text-[10px] text-neutral-400 transition-transform ${
                        collapsed.has(row.project.id) ? "" : "rotate-90"
                      }`}
                    >
                      ▶
                    </span>
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: row.project.color }}
                    />
                    <span className="truncate text-sm font-semibold text-neutral-800">
                      {row.project.name}
                    </span>
                    {collapsed.has(row.project.id) && (
                      <span className="ml-auto shrink-0 text-xs text-neutral-400">
                        {
                          visibleTasks.filter(
                            (t) => t.projectId === row.project.id
                          ).length
                        }
                      </span>
                    )}
                  </button>
                ) : (
                  <div
                    key={row.task.id}
                    onClick={() => setOpenTask(row.task)}
                    className="flex cursor-pointer items-center gap-2 border-b border-neutral-100 py-1 pl-7 pr-3 hover:bg-neutral-50"
                    style={{ height: row.height }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: STATUS_COLORS[row.task.status] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">
                      {row.task.title}
                    </span>
                    {row.task.assignee && (
                      <Avatar user={row.task.assignee} size={20} />
                    )}
                  </div>
                )
              )}
            </div>

            {/* track */}
            <div className="relative" style={{ width: trackW, height: totalH }}>
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
                style={{
                  left: ((today - range.min) / DAY_MS) * CELL + CELL / 2,
                }}
              />

              {/* project header rows: 背景 + 期間サマリー */}
              {rows.map((row) => {
                if (row.kind !== "project") return null;
                const span = projectSpans.get(row.project.id);
                return (
                  <div key={`ph-${row.project.id}`}>
                    <div
                      className="absolute left-0 right-0 border-b border-neutral-200 bg-neutral-50"
                      style={{ top: row.top, height: row.height }}
                    />
                    {span && (
                      <div
                        className="pointer-events-none absolute rounded-full opacity-40"
                        style={{
                          left: ((span.min - range.min) / DAY_MS) * CELL + 1,
                          width:
                            ((span.max - span.min) / DAY_MS + 1) * CELL - 2,
                          top: row.top + row.height / 2 - 3,
                          height: 6,
                          background: row.project.color,
                        }}
                      />
                    )}
                  </div>
                );
              })}

              {/* row separators */}
              {rows.map((row) =>
                row.kind === "task" ? (
                  <div
                    key={`sep-${row.task.id}`}
                    className="absolute left-0 right-0 border-b border-neutral-100"
                    style={{ top: row.top + row.height - 1 }}
                  />
                ) : null
              )}

              {/* milestones（プロジェクトのグループ範囲に表示） */}
              {milestones.map((m) => {
                const bounds = groupBounds.get(m.projectId);
                if (!bounds) return null;
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
                      className={`pointer-events-none absolute z-[6] w-0.5 ${
                        dragging ? "bg-violet-400" : "bg-violet-500/70"
                      }`}
                      style={{
                        left: x - 1,
                        top: bounds.top,
                        height: bounds.height,
                      }}
                    />
                    <div
                      onPointerDown={(e) => startMsDrag(e, m)}
                      onPointerMove={moveMsDrag}
                      onPointerUp={() => endMsDrag(m)}
                      className="group absolute z-30 cursor-grab touch-none"
                      style={{
                        left: x - 7,
                        top: bounds.top + 1,
                        width: 14,
                        height: 18,
                      }}
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
              {rows.map((row) => {
                if (row.kind !== "task") return null;
                const due = dayValue(row.task.dueDate);
                if (due === null || due < range.min || due > range.max)
                  return null;
                const x = ((due - range.min) / DAY_MS + 1) * CELL - 1;
                const geo = barGeometry(row.task);
                let conn: { left: number; width: number } | null = null;
                if (geo) {
                  const right = geo.left + geo.width;
                  if (x > right) conn = { left: right, width: x - right };
                  else if (x < geo.left)
                    conn = { left: x, width: geo.left - x };
                }
                return (
                  <div key={`due-${row.task.id}`}>
                    {conn && (
                      <div
                        className="pointer-events-none absolute z-[5] border-t border-dashed border-red-400"
                        style={{
                          left: conn.left,
                          width: conn.width,
                          top: row.top + row.height / 2,
                        }}
                      />
                    )}
                    <div
                      className="pointer-events-none absolute z-20 w-0.5 rounded bg-red-500"
                      style={{ left: x, top: row.top + 4, height: row.height - 8 }}
                    />
                    <div
                      className="group absolute z-[5]"
                      style={{
                        left: x - 5,
                        width: 11,
                        top: row.top,
                        height: row.height,
                      }}
                    >
                      <div className="pointer-events-none absolute -top-1 left-2 z-30 hidden whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white shadow group-hover:block">
                        期限 {fmtMD(due)}：{row.task.title}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* bars */}
              {rows.map((row) => {
                if (row.kind !== "task") return null;
                const t = row.task;
                const geo = barGeometry(t);
                if (!geo) {
                  return (
                    <div
                      key={t.id}
                      onClick={(e) => scheduleAt(e, t)}
                      className="group absolute left-0 right-0 cursor-copy"
                      style={{ top: row.top, height: row.height }}
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
                    } ${t.status === "DONE" ? "opacity-50" : ""}`}
                    style={{
                      left: geo.left + 1,
                      width: Math.max(geo.width - 2, CELL - 2),
                      top: row.top + 7,
                      height: row.height - 14,
                      background: t.project.color,
                    }}
                    title={t.title}
                  >
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

      {msModal && (
        <MilestoneModal
          projectId={msModal.projectId}
          milestone={msModal}
          onClose={() => setMsModal(null)}
          onSaved={(m) =>
            setMilestones((prev) => prev.map((x) => (x.id === m.id ? m : x)))
          }
          onDeleted={(id) =>
            setMilestones((prev) => prev.filter((m) => m.id !== id))
          }
        />
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
                old.id === t.id ? ({ ...old, ...t } as GanttTask) : old
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
