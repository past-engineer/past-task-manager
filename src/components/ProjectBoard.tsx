"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useUndo, pickPrev } from "@/lib/useUndo";
import type {
  TaskLite,
  MemberLite,
  MilestoneLite,
  BusyDayInfo,
} from "@/lib/types";
import type { TaskStatus } from "@prisma/client";
import KanbanBoard from "@/components/KanbanBoard";
import ListView from "@/components/ListView";
import GanttView from "@/components/GanttView";
import TaskDetailModal from "@/components/TaskDetailModal";
import NewTaskModal from "@/components/NewTaskModal";
import MembersBar from "@/components/MembersBar";
import ProjectSettingsButton from "@/components/ProjectSettingsButton";
import MilestoneModal from "@/components/MilestoneModal";

type View = "kanban" | "list" | "gantt";

export default function ProjectBoard({
  projectId,
  projectName,
  projectDescription,
  projectColor,
  initialTasks,
  initialMilestones,
  nonWorkingWeekdays,
  orgHolidays = [],
  fullyBusyDays = [],
  canEdit = true,
  projectThumbnailUrl = null,
  members: initialMembers,
  currentUserId,
}: {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  projectColor: string;
  initialMilestones: MilestoneLite[];
  nonWorkingWeekdays: number[];
  orgHolidays?: string[];
  fullyBusyDays?: BusyDayInfo[];
  canEdit?: boolean;
  projectThumbnailUrl?: string | null;
  initialTasks: TaskLite[];
  members: MemberLite[];
  currentUserId: string;
}) {
  const [tasks, setTasks] = useState<TaskLite[]>(initialTasks);
  const [members, setMembers] = useState<MemberLite[]>(initialMembers);
  const [view, setViewState] = useState<View>("kanban");

  useEffect(() => {
    const saved = window.localStorage.getItem(`ptm-view:${projectId}`);
    if (saved === "kanban" || saved === "list" || saved === "gantt")
      setViewState(saved);
  }, [projectId]);

  const setView = useCallback(
    (v: View) => {
      setViewState(v);
      window.localStorage.setItem(`ptm-view:${projectId}`, v);
    },
    [projectId]
  );
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null);
  const [milestones, setMilestones] =
    useState<MilestoneLite[]>(initialMilestones);
  const [msModal, setMsModal] = useState<MilestoneLite | "new" | null>(null);

  const pushUndo = useUndo();
  const tasksRef = useRef(tasks);
  const milestonesRef = useRef(milestones);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    milestonesRef.current = milestones;
  }, [milestones]);

  // 取り消し用（undo スタックには積まない）
  const rawPatchMilestone = useCallback(
    async (id: string, dateIso: string) => {
      setMilestones((prev) =>
        prev.map((m) => (m.id === id ? { ...m, date: dateIso } : m))
      );
      await fetch(`/api/milestones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateIso }),
      });
    },
    []
  );

  const patchMilestone = useCallback(
    async (id: string, dateIso: string) => {
      const prev = milestonesRef.current.find((m) => m.id === id);
      if (prev) {
        const prevDate = prev.date.slice(0, 10);
        pushUndo(
          () => rawPatchMilestone(id, prevDate),
          () => rawPatchMilestone(id, dateIso)
        );
      }
      await rawPatchMilestone(id, dateIso);
    },
    [pushUndo, rawPatchMilestone]
  );

  const upsertTask = useCallback((task: TaskLite) => {
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      if (exists) return prev.map((t) => (t.id === task.id ? { ...t, ...task } : t));
      return [...prev, task];
    });
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const rawPatchTask = useCallback(
    async (id: string, data: Partial<TaskLite>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...data } : t))
      );
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    []
  );

  const patchTask = useCallback(
    async (id: string, data: Partial<TaskLite>) => {
      const prev = tasksRef.current.find((t) => t.id === id);
      if (prev) {
        const prevData = pickPrev(prev, data);
        pushUndo(
          () => rawPatchTask(id, prevData),
          () => rawPatchTask(id, data)
        );
      }
      await rawPatchTask(id, data);
    },
    [pushUndo, rawPatchTask]
  );

  const rawReorder = useCallback(
    async (
      apply: (prev: TaskLite[]) => TaskLite[],
      updates: { id: string; status: TaskStatus; position: number }[]
    ) => {
      setTasks(apply);
      await fetch("/api/tasks/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, updates }),
      });
    },
    [projectId]
  );

  const reorder = useCallback(
    async (
      next: TaskLite[],
      updates: { id: string; status: TaskStatus; position: number }[]
    ) => {
      // 逆操作：対象タスクの元の status/position を復元
      const inverse = updates
        .map((u) => {
          const t = tasksRef.current.find((x) => x.id === u.id);
          return t
            ? { id: t.id, status: t.status, position: t.position }
            : null;
        })
        .filter((x): x is { id: string; status: TaskStatus; position: number } => !!x);
      if (inverse.length > 0) {
        pushUndo(
          () =>
            rawReorder(
              (prev) =>
                prev.map((t) => {
                  const inv = inverse.find((i) => i.id === t.id);
                  return inv
                    ? { ...t, status: inv.status, position: inv.position }
                    : t;
                }),
              inverse
            ),
          () =>
            rawReorder(
              (prev) =>
                prev.map((t) => {
                  const u = updates.find((i) => i.id === t.id);
                  return u
                    ? { ...t, status: u.status, position: u.position }
                    : t;
                }),
              updates
            )
        );
      }
      await rawReorder(() => next, updates);
    },
    [pushUndo, rawReorder]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      removeTask(id);
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    },
    [removeTask]
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-4 w-4 rounded-full"
            style={{ background: projectColor }}
          />
          <h1 className="text-xl font-semibold text-neutral-900">
            {projectName}
          </h1>
          {canEdit && (
            <ProjectSettingsButton
              projectId={projectId}
              name={projectName}
              description={projectDescription}
              color={projectColor}
              thumbnailUrl={projectThumbnailUrl}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <MembersBar
            projectId={projectId}
            members={members}
            canAdd={canEdit}
            onAdd={(m) => setMembers((prev) => [...prev, m])}
          />
          <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
            <button
              onClick={() => setView("kanban")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === "kanban"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              カンバン
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === "list"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              リスト
            </button>
            <button
              onClick={() => setView("gantt")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === "gantt"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              ガント
            </button>
          </div>
          {canEdit && view === "gantt" && (
            <button
              onClick={() => setMsModal("new")}
              className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-600 transition hover:bg-violet-50"
            >
              + マイルストーン
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setNewTaskStatus("TODO")}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              + 新規タスク
            </button>
          )}
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard
          tasks={tasks}
          members={members}
          onReorder={reorder}
          onOpen={setOpenTaskId}
          onAddInColumn={(status) => setNewTaskStatus(status)}
        />
      ) : view === "list" ? (
        <ListView
          tasks={tasks}
          members={members}
          onOpen={setOpenTaskId}
          onPatch={patchTask}
        />
      ) : (
        <GanttView
          tasks={tasks}
          milestones={milestones}
          nonWorkingWeekdays={nonWorkingWeekdays}
          orgHolidays={orgHolidays}
          fullyBusyDays={fullyBusyDays}
          onOpen={setOpenTaskId}
          onPatch={patchTask}
          onMilestonePatch={patchMilestone}
          onMilestoneOpen={(m) => setMsModal(m)}
        />
      )}

      {msModal && (
        <MilestoneModal
          projectId={projectId}
          milestone={msModal === "new" ? null : msModal}
          onClose={() => setMsModal(null)}
          onSaved={(m) =>
            setMilestones((prev) => {
              const exists = prev.some((x) => x.id === m.id);
              const next = exists
                ? prev.map((x) => (x.id === m.id ? m : x))
                : [...prev, m];
              return next.sort(
                (a, b) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime()
              );
            })
          }
          onDeleted={(id) =>
            setMilestones((prev) => prev.filter((m) => m.id !== id))
          }
        />
      )}

      {newTaskStatus && (
        <NewTaskModal
          projectId={projectId}
          members={members}
          defaultStatus={newTaskStatus}
          onClose={() => setNewTaskStatus(null)}
          onCreated={(t) => {
            upsertTask(t);
            setNewTaskStatus(null);
          }}
        />
      )}

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          projectId={projectId}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setOpenTaskId(null)}
          onChanged={(t) => upsertTask(t)}
          onDeleted={(id) => {
            removeTask(id);
            setOpenTaskId(null);
          }}
        />
      )}
    </div>
  );
}
