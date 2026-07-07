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

/** ユーザーがメンバーであるプロジェクトのみ。アクセス権がなければ null */
export async function getProjectForUser(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    include: {
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

/** 単純なアクセス権チェック */
export async function userCanAccessProject(projectId: string, userId: string) {
  const count = await prisma.projectMember.count({
    where: { projectId, userId },
  });
  return count > 0;
}

/** 全体設定：非稼働曜日（0=日〜6=土）。未設定なら土日 */
export async function getNonWorkingWeekdays(): Promise<number[]> {
  const s = await prisma.workspaceSetting.findUnique({
    where: { id: "global" },
  });
  return s?.nonWorkingWeekdays ?? [0, 6];
}

/** 全体設定（非稼働曜日＋1日の稼働時間） */
export async function getWorkspaceSettings(): Promise<{
  nonWorkingWeekdays: number[];
  dailyWorkHours: number;
}> {
  const s = await prisma.workspaceSetting.findUnique({
    where: { id: "global" },
  });
  return {
    nonWorkingWeekdays: s?.nonWorkingWeekdays ?? [0, 6],
    dailyWorkHours: s?.dailyWorkHours ?? 8,
  };
}

/** タスク経由でアクセス権チェック（タスクの属するプロジェクトのメンバーか） */
export async function userCanAccessTask(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { members: { some: { userId } } } },
    select: { id: true, projectId: true },
  });
  return task;
}
