import { cookies } from "next/headers";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ORG_COOKIE = "ptm-org";

export type OrgContext = {
  orgId: string;
  orgName: string;
  role: OrgRole;
};

/** ユーザーが所属する組織一覧（role 付き） */
export async function getUserOrgs(userId: string) {
  return prisma.organizationMember.findMany({
    where: { userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
}

/** 現在の組織（Cookie で選択、無効なら最初の所属組織）。未所属なら null */
export async function getCurrentOrg(userId: string): Promise<OrgContext | null> {
  const memberships = await getUserOrgs(userId);
  if (memberships.length === 0) return null;
  const store = await cookies();
  const wanted = store.get(ORG_COOKIE)?.value;
  const m = memberships.find((x) => x.orgId === wanted) ?? memberships[0];
  return { orgId: m.orgId, orgName: m.org.name, role: m.role };
}

/** 現在の組織コンテキストを要求（API 用）。未所属は例外 */
export async function requireOrgContext(
  userId: string
): Promise<OrgContext> {
  const ctx = await getCurrentOrg(userId);
  if (!ctx) throw new Error("NO_ORG");
  return ctx;
}

/** 指定組織でのユーザーの role。非メンバーは null */
export async function getOrgRole(
  orgId: string,
  userId: string
): Promise<OrgRole | null> {
  const m = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/** プロジェクトの所属組織でのユーザーの role。アクセス不可は null */
export async function getProjectRole(
  projectId: string,
  userId: string
): Promise<OrgRole | null> {
  const m = await prisma.organizationMember.findFirst({
    where: { userId, org: { projects: { some: { id: projectId } } } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/** タスクの所属組織でのユーザーの role。アクセス不可は null */
export async function getTaskRole(
  taskId: string,
  userId: string
): Promise<OrgRole | null> {
  const m = await prisma.organizationMember.findFirst({
    where: {
      userId,
      org: { projects: { some: { tasks: { some: { id: taskId } } } } },
    },
    select: { role: true },
  });
  return m?.role ?? null;
}

/** 編集可能な role か（閲覧者は不可） */
export function canEdit(role: OrgRole | null): boolean {
  return role === "ADMIN" || role === "MEMBER";
}
