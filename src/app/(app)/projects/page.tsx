import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/data";
import NewProjectButton from "@/components/NewProjectButton";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    include: { _count: { select: { tasks: true, members: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">プロジェクト</h1>
        <NewProjectButton />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <p className="text-neutral-500">まだプロジェクトがありません。</p>
          <p className="mt-1 text-sm text-neutral-400">
            右上の「新規プロジェクト」から作成してください。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-400"
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: p.color }}
                />
                <h2 className="font-medium text-neutral-900 group-hover:text-neutral-900">
                  {p.name}
                </h2>
              </div>
              {p.description && (
                <p className="mb-3 line-clamp-2 text-sm text-neutral-500">
                  {p.description}
                </p>
              )}
              <div className="flex gap-4 text-xs text-neutral-400">
                <span>タスク {p._count.tasks}</span>
                <span>メンバー {p._count.members}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
