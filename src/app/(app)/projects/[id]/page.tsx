import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  getWorkspaceSettings,
  userCanAccessProject,
} from "@/lib/data";
import { getProjectRole, canEdit as canEditRole } from "@/lib/org";
import ProjectBoard from "@/components/ProjectBoard";
import type {
  TaskLite,
  MemberLite,
  MilestoneLite,
  BusyDayInfo,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;
  const { id } = await params;

  if (!(await userCanAccessProject(id, userId))) notFound();
  const role = await getProjectRole(id, userId);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
      tasks: {
        where: { parentId: null },
        include: {
          assignee: true,
          _count: {
            select: { subtasks: true, comments: true, attachments: true },
          },
        },
        orderBy: [{ status: "asc" }, { position: "asc" }],
      },
      milestones: { orderBy: { date: "asc" } },
    },
  });

  if (!project) notFound();

  const tasks = JSON.parse(JSON.stringify(project.tasks)) as TaskLite[];

  // 担当候補は組織メンバー全員
  const orgMembers = project.orgId
    ? await prisma.organizationMember.findMany({
        where: { orgId: project.orgId },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const members = JSON.parse(
    JSON.stringify(
      orgMembers.map((m) => ({ id: m.id, role: "MEMBER", user: m.user }))
    )
  ) as MemberLite[];
  const milestones = JSON.parse(
    JSON.stringify(project.milestones)
  ) as MilestoneLite[];

  const settings = project.orgId
    ? await getWorkspaceSettings(project.orgId)
    : { nonWorkingWeekdays: [0, 6], dailyWorkHours: 8, holidays: [] };

  // 全メンバーの予定が埋まっている日（組織全体の未完了タスク＋個人非稼働日で判定）
  const fullyBusyDays: BusyDayInfo[] = [];
  if (project.orgId && orgMembers.length > 0) {
    const memberIds = orgMembers.map((m) => m.userId);
    const [busyTasks, allDaysOff] = await Promise.all([
      prisma.task.findMany({
        where: {
          project: { orgId: project.orgId, archived: false },
          assigneeId: { in: memberIds },
          status: { not: "DONE" },
        },
        select: {
          assigneeId: true,
          title: true,
          startDate: true,
          endDate: true,
          dueDate: true,
          project: { select: { name: true } },
        },
      }),
      prisma.dayOff.findMany({
        where: { userId: { in: memberIds } },
        select: { userId: true, date: true },
      }),
    ]);
    const DAY = 86_400_000;
    const toDay = (d: Date | null) =>
      d ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : null;
    const busyByUser = new Map<string, Set<number>>(
      memberIds.map((uid) => [uid, new Set<number>()])
    );
    const intervalsByUser = new Map<
      string,
      { lo: number; hi: number; label: string }[]
    >(memberIds.map((uid) => [uid, []]));
    const dayOffByUser = new Map<string, Set<number>>(
      memberIds.map((uid) => [uid, new Set<number>()])
    );
    for (const t of busyTasks) {
      if (!t.assigneeId) continue;
      const s0 = toDay(t.startDate);
      const e0 = toDay(t.endDate) ?? toDay(t.dueDate);
      const s = s0 ?? e0;
      const e = e0 ?? s0;
      if (s === null || e === null) continue;
      const lo = Math.min(s, e);
      const hi = Math.max(s, e);
      if ((hi - lo) / DAY > 400) continue; // 異常データ保護
      const set = busyByUser.get(t.assigneeId);
      if (!set) continue;
      for (let d = lo; d <= hi; d += DAY) set.add(d);
      intervalsByUser
        .get(t.assigneeId)!
        .push({ lo, hi, label: `${t.title}（${t.project.name}）` });
    }
    for (const off of allDaysOff) {
      const d = toDay(off.date);
      if (d === null) continue;
      busyByUser.get(off.userId)?.add(d);
      dayOffByUser.get(off.userId)?.add(d);
    }
    const memberName = new Map(
      orgMembers.map((m) => [
        m.userId,
        m.user.name ?? m.user.email ?? "（不明）",
      ])
    );
    const sets = [...busyByUser.values()].sort((a, b) => a.size - b.size);
    const [first, ...rest] = sets;
    if (first) {
      for (const d of first) {
        if (!rest.every((s) => s.has(d))) continue;
        fullyBusyDays.push({
          date: new Date(d).toISOString().slice(0, 10),
          members: memberIds.map((uid) => {
            const items = intervalsByUser
              .get(uid)!
              .filter((iv) => iv.lo <= d && d <= iv.hi)
              .map((iv) => iv.label);
            if (dayOffByUser.get(uid)!.has(d)) items.push("非稼働日（休暇）");
            return { name: memberName.get(uid)!, items };
          }),
        });
      }
    }
  }

  return (
    <div>
      <nav className="mb-4 text-sm text-neutral-400">
        <Link href="/projects" className="hover:text-neutral-600">
          プロジェクト
        </Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-600">{project.name}</span>
      </nav>

      <ProjectBoard
        projectId={project.id}
        projectName={project.name}
        projectDescription={project.description}
        projectColor={project.color}
        initialTasks={tasks}
        initialMilestones={milestones}
        nonWorkingWeekdays={settings.nonWorkingWeekdays}
        orgHolidays={settings.holidays}
        fullyBusyDays={fullyBusyDays}
        canEdit={canEditRole(role)}
        projectThumbnailUrl={project.thumbnailUrl}
        members={members}
        currentUserId={userId}
      />
    </div>
  );
}
