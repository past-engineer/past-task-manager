import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** ログイン中ユーザーを取得。未ログインなら null */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** ログイン必須。未ログインは例外 */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.id) throw new Error("UNAUTHORIZED");
  return user.id;
}

/** ユーザーがアクセスできるプロジェクトのみ。アクセス権がなければ null */
export async function getProjectForUser(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, org: { members: { some: { userId } } } },
    include: {
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

/** アクセス権チェック（プロジェクトの所属組織のメンバーか） */
export async function userCanAccessProject(projectId: string, userId: string) {
  const count = await prisma.project.count({
    where: { id: projectId, org: { members: { some: { userId } } } },
  });
  return count > 0;
}

/** 組織の全体設定（非稼働曜日＋1日の稼働時間＋組織の非稼働日） */
export async function getWorkspaceSettings(orgId: string): Promise<{
  nonWorkingWeekdays: number[];
  dailyWorkHours: number;
  holidays: string[];
}> {
  const [s, holidays] = await Promise.all([
    prisma.workspaceSetting.findUnique({ where: { orgId } }),
    prisma.orgHoliday.findMany({
      where: { orgId },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);
  return {
    nonWorkingWeekdays: s?.nonWorkingWeekdays ?? [0, 6],
    dailyWorkHours: s?.dailyWorkHours ?? 8,
    holidays: holidays.map((h) => h.date.toISOString()),
  };
}

/** タスク経由でアクセス権チェック（タスクの属する組織のメンバーか） */
export async function userCanAccessTask(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: { org: { members: { some: { userId } } } },
    },
    select: { id: true, projectId: true },
  });
  return task;
}
