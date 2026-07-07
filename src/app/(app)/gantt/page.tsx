import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getWorkspaceSettings } from "@/lib/data";
import { getCurrentOrg } from "@/lib/org";
import AllProjectsGantt, {
  type GanttTask,
} from "@/components/AllProjectsGantt";
import type { MemberLite, MilestoneLite } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AllGanttPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;

  const org = await getCurrentOrg(userId);
  if (!org) redirect("/projects");

  const projects = await prisma.project.findMany({
    where: { orgId: org.orgId, archived: false },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });

  const rawTasks = await prisma.task.findMany({
    where: {
      parentId: null,
      project: { orgId: org.orgId, archived: false },
    },
    include: {
      assignee: true,
      project: { select: { id: true, name: true, color: true } },
      _count: { select: { subtasks: true, comments: true, attachments: true } },
    },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });

  const tasks = JSON.parse(JSON.stringify(rawTasks)) as GanttTask[];

  const rawMilestones = await prisma.milestone.findMany({
    where: { project: { orgId: org.orgId, archived: false } },
    orderBy: { date: "asc" },
  });
  const milestones = JSON.parse(
    JSON.stringify(rawMilestones)
  ) as MilestoneLite[];

  const membersByProject: Record<string, MemberLite[]> = {};
  const projectList = projects.map((p) => {
    membersByProject[p.id] = JSON.parse(
      JSON.stringify(p.members)
    ) as MemberLite[];
    return { id: p.id, name: p.name, color: p.color };
  });

  const { nonWorkingWeekdays, holidays } = await getWorkspaceSettings(
    org.orgId
  );

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">
        全プロジェクトスケジュール
      </h1>
      <AllProjectsGantt
        projects={projectList}
        tasks={tasks}
        milestones={milestones}
        nonWorkingWeekdays={nonWorkingWeekdays}
        orgHolidays={holidays}
        membersByProject={membersByProject}
        currentUserId={userId}
      />
    </div>
  );
}
