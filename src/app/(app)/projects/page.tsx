import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/data";
import { getCurrentOrg } from "@/lib/org";
import NewProjectButton from "@/components/NewProjectButton";
import ProjectsIndex from "@/components/ProjectsIndex";
import OrgCreatePrompt from "@/components/OrgCreatePrompt";
import type { FolderLite, ProjectCardData } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;

  const org = await getCurrentOrg(userId);
  if (!org) {
    return (
      <div className="py-16">
        <OrgCreatePrompt />
      </div>
    );
  }
  const canEdit = org.role !== "VIEWER";

  const [rawFolders, rawProjects] = await Promise.all([
    prisma.projectFolder.findMany({
      where: { orgId: org.orgId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    prisma.project.findMany({
      where: { orgId: org.orgId },
      include: { _count: { select: { tasks: true, members: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  // プロジェクトごとのステータス別タスク数
  const grouped = await prisma.task.groupBy({
    by: ["projectId", "status"],
    where: { project: { orgId: org.orgId } },
    _count: { _all: true },
  });
  const countsByProject: Record<string, Record<string, number>> = {};
  for (const g of grouped) {
    (countsByProject[g.projectId] ??= {})[g.status] = g._count._all;
  }

  const folders = JSON.parse(JSON.stringify(rawFolders)) as FolderLite[];
  const projects = JSON.parse(
    JSON.stringify(
      rawProjects.map((p) => ({
        ...p,
        statusCounts: countsByProject[p.id] ?? {},
      }))
    )
  ) as ProjectCardData[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">
          プロジェクト
        </h1>
        {canEdit && <NewProjectButton />}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <p className="text-neutral-500">まだプロジェクトがありません。</p>
          {canEdit && (
            <p className="mt-1 text-sm text-neutral-400">
              右上の「新規プロジェクト」から作成してください。
            </p>
          )}
        </div>
      ) : (
        <ProjectsIndex
          folders={folders}
          projects={projects}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
