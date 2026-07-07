"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { TaskLite, MemberLite } from "@/lib/types";
import type { TaskStatus } from "@prisma/client";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import TaskCard from "@/components/TaskCard";

type Columns = Record<TaskStatus, TaskLite[]>;

function groupByStatus(tasks: TaskLite[]): Columns {
  const cols = {} as Columns;
  for (const s of STATUS_ORDER) cols[s] = [];
  for (const t of [...tasks].sort((a, b) => a.position - b.position)) {
    (cols[t.status] ??= []).push(t);
  }
  return cols;
}

export default function KanbanBoard({
  tasks,
  members,
  onReorder,
  onOpen,
  onAddInColumn,
}: {
  tasks: TaskLite[];
  members: MemberLite[];
  onReorder: (
    next: TaskLite[],
    updates: { id: string; status: TaskStatus; position: number }[]
  ) => void;
  onOpen: (id: string) => void;
  onAddInColumn: (status: TaskStatus) => void;
}) {
  const [columns, setColumns] = useState<Columns>(() => groupByStatus(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setColumns(groupByStatus(tasks));
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const taskById = useMemo(() => {
    const m = new Map<string, TaskLite>();
    tasks.forEach((t) => m.set(t.id, t));
    return m;
  }, [tasks]);

  const activeTask = activeId ? taskById.get(activeId) : null;

  function findColumn(id: string): TaskStatus | null {
    if (STATUS_ORDER.includes(id as TaskStatus)) return id as TaskStatus;
    for (const s of STATUS_ORDER) {
      if (columns[s].some((t) => t.id === id)) return s;
    }
    return null;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeCol = findColumn(active.id as string);
    const overCol = findColumn(over.id as string);
    if (!activeCol || !overCol || activeCol === overCol) return;

    setColumns((prev) => {
      const activeItems = prev[activeCol];
      const overItems = prev[overCol];
      const activeIndex = activeItems.findIndex((t) => t.id === active.id);
      if (activeIndex < 0) return prev;
      const moved = { ...activeItems[activeIndex], status: overCol };

      const overIndex = overItems.findIndex((t) => t.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;

      return {
        ...prev,
        [activeCol]: activeItems.filter((t) => t.id !== active.id),
        [overCol]: [
          ...overItems.slice(0, insertAt),
          moved,
          ...overItems.slice(insertAt),
        ],
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const activeCol = findColumn(active.id as string);
    const overCol = findColumn(over.id as string);
    if (!activeCol || !overCol) return;

    let nextColumns = columns;
    if (activeCol === overCol) {
      const items = columns[activeCol];
      const oldIndex = items.findIndex((t) => t.id === active.id);
      const newIndex = items.findIndex((t) => t.id === over.id);
      if (oldIndex !== newIndex && newIndex >= 0) {
        const reordered = [...items];
        const [m] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, m);
        nextColumns = { ...columns, [activeCol]: reordered };
        setColumns(nextColumns);
      }
    }

    // 全タスクを再構成し、位置とステータスを確定。
    // 差分判定は「元データ(props)」と比較する（columns はドラッグ中の
    // プレビューで既にステータスが書き換わっているため）。
    const next: TaskLite[] = [];
    const updates: { id: string; status: TaskStatus; position: number }[] = [];
    for (const s of STATUS_ORDER) {
      nextColumns[s].forEach((t, idx) => {
        next.push({ ...t, status: s, position: idx });
        const orig = taskById.get(t.id);
        if (!orig || orig.status !== s || orig.position !== idx) {
          updates.push({ id: t.id, status: s, position: idx });
        }
      });
    }
    if (updates.length > 0) onReorder(next, updates);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            members={members}
            onOpen={onOpen}
            onAdd={() => onAddInColumn(status)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 opacity-90">
            <TaskCard task={activeTask} members={members} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  members,
  onOpen,
  onAdd,
}: {
  status: TaskStatus;
  tasks: TaskLite[];
  members: MemberLite[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const totalEstimate = tasks.reduce((s, t) => s + (t.estimate ?? 0), 0);

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: STATUS_COLORS[status] }}
          />
          <span className="text-sm font-semibold text-neutral-700">
            {STATUS_LABELS[status]}
          </span>
          <span className="text-xs text-neutral-400">{tasks.length}</span>
        </div>
        {totalEstimate > 0 && (
          <span className="text-xs text-neutral-400">{totalEstimate}h</span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl p-2 transition ${
          isOver ? "bg-neutral-200/60" : "bg-neutral-100/70"
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableCard
              key={task.id}
              task={task}
              members={members}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>

        <button
          onClick={onAdd}
          className="rounded-lg px-2 py-1.5 text-left text-sm text-neutral-400 transition hover:bg-white hover:text-neutral-600"
        >
          + タスクを追加
        </button>
      </div>
    </div>
  );
}

function SortableCard({
  task,
  members,
  onOpen,
}: {
  task: TaskLite;
  members: MemberLite[];
  onOpen: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} members={members} onOpen={onOpen} />
    </div>
  );
}
