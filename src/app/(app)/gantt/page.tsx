import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getNonWorkingWeekdays } from "@/lib/data";
import AllProjectsGantt, {
  type GanttTask,
} from "@/components/AllProjectsGantt";
import type { MemberLite, MilestoneLite } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AllGanttPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });

  const rawTasks = await prisma.task.findMany({
    where: {
      parentId: null,
      project: { members: { some: { userId } } },
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
    where: { project: { members: { some: { userId } } } },
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

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">
        全プロジェクトスケジュール
      </h1>
      <AllProjectsGantt
        projects={projectList}
        tasks={tasks}
        milestones={milestones}
        nonWorkingWeekdays={await getNonWorkingWeekdays()}
        membersByProject={membersByProject}
        currentUserId={userId}
      />
    </div>
  );
}
