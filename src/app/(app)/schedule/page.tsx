import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getNonWorkingWeekdays } from "@/lib/data";
import ScheduleBoard, { type ScheduleTask } from "@/components/ScheduleBoard";
import type { MemberLite, UserLite, DayOffLite } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });

  const rawTasks = await prisma.task.findMany({
    where: { project: { members: { some: { userId } } } },
    include: {
      assignee: true,
      project: { select: { id: true, name: true, color: true } },
      _count: { select: { subtasks: true, comments: true, attachments: true } },
    },
    orderBy: [{ dueDate: "asc" }],
  });

  const tasks = JSON.parse(JSON.stringify(rawTasks)) as ScheduleTask[];

  // プロジェクト横断のメンバー一覧（重複除去）
  const peopleMap = new Map<string, UserLite>();
  const membersByProject: Record<string, MemberLite[]> = {};
  for (const p of projects) {
    membersByProject[p.id] = JSON.parse(
      JSON.stringify(p.members)
    ) as MemberLite[];
    for (const m of p.members) {
      if (!peopleMap.has(m.userId)) {
        peopleMap.set(m.userId, {
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
        });
      }
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">
        メンバースケジュール
      </h1>
      <ScheduleBoard
        tasks={tasks}
        people={[...peopleMap.values()]}
        daysOff={
          JSON.parse(
            JSON.stringify(
              await prisma.dayOff.findMany({
                where: { userId: { in: [...peopleMap.keys()] } },
                orderBy: { date: "asc" },
              })
            )
          ) as DayOffLite[]
        }
        nonWorkingWeekdays={await getNonWorkingWeekdays()}
        membersByProject={membersByProject}
        currentUserId={userId}
      />
    </div>
  );
}
