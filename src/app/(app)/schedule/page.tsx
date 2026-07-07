import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getWorkspaceSettings } from "@/lib/data";
import { getCurrentOrg } from "@/lib/org";
import ScheduleBoard, { type ScheduleTask } from "@/components/ScheduleBoard";
import type { MemberLite, UserLite, DayOffLite } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
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
    where: { project: { orgId: org.orgId, archived: false } },
    include: {
      assignee: true,
      project: { select: { id: true, name: true, color: true } },
      _count: { select: { subtasks: true, comments: true, attachments: true } },
    },
    orderBy: [{ dueDate: "asc" }],
  });

  const tasks = JSON.parse(JSON.stringify(rawTasks)) as ScheduleTask[];

  // 行 = 組織のメンバー全員
  const orgMembers = await prisma.organizationMember.findMany({
    where: { orgId: org.orgId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const people: UserLite[] = orgMembers.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    dailyCapacity: m.user.dailyCapacity,
  }));

  const membersByProject: Record<string, MemberLite[]> = {};
  for (const p of projects) {
    membersByProject[p.id] = JSON.parse(
      JSON.stringify(p.members)
    ) as MemberLite[];
  }

  const { nonWorkingWeekdays, holidays } = await getWorkspaceSettings(
    org.orgId
  );

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">
        メンバースケジュール
      </h1>
      <ScheduleBoard
        tasks={tasks}
        people={people}
        daysOff={
          JSON.parse(
            JSON.stringify(
              await prisma.dayOff.findMany({
                where: { userId: { in: people.map((p) => p.id) } },
                orderBy: { date: "asc" },
              })
            )
          ) as DayOffLite[]
        }
        nonWorkingWeekdays={nonWorkingWeekdays}
        orgHolidays={holidays}
        membersByProject={membersByProject}
        currentUserId={userId}
      />
    </div>
  );
}
