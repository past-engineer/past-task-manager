import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  getNonWorkingWeekdays,
  userCanAccessProject,
} from "@/lib/data";
import ProjectBoard from "@/components/ProjectBoard";
import type { TaskLite, MemberLite, MilestoneLite } from "@/lib/types";

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
  const members = JSON.parse(JSON.stringify(project.members)) as MemberLite[];
  const milestones = JSON.parse(
    JSON.stringify(project.milestones)
  ) as MilestoneLite[];

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
        nonWorkingWeekdays={await getNonWorkingWeekdays()}
        members={members}
        currentUserId={userId}
      />
    </div>
  );
}
