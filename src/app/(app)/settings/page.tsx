import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getWorkspaceSettings } from "@/lib/data";
import SettingsBoard from "@/components/SettingsBoard";
import type { DayOffLite, UserLite } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;

  const { nonWorkingWeekdays, dailyWorkHours } = await getWorkspaceSettings();

  // 自分とプロジェクトを共有するメンバー（自分含む）
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: true } } },
  });
  const peopleMap = new Map<string, UserLite>();
  for (const p of projects) {
    for (const m of p.members) {
      if (!peopleMap.has(m.userId)) {
        peopleMap.set(m.userId, {
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          dailyCapacity: m.user.dailyCapacity,
        });
      }
    }
  }
  // プロジェクト未参加でも自分は表示
  if (!peopleMap.has(userId)) {
    peopleMap.set(userId, {
      id: userId,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
    });
  }
  const people = [...peopleMap.values()];

  const rawDaysOff = await prisma.dayOff.findMany({
    where: { userId: { in: people.map((p) => p.id) } },
    orderBy: { date: "asc" },
  });
  const daysOff = JSON.parse(JSON.stringify(rawDaysOff)) as DayOffLite[];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">設定</h1>
      <SettingsBoard
        initialNonWorkingWeekdays={nonWorkingWeekdays}
        initialDailyWorkHours={dailyWorkHours}
        people={people}
        initialDaysOff={daysOff}
      />
    </div>
  );
}
