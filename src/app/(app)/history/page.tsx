import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/data";
import { getCurrentOrg } from "@/lib/org";
import HistoryList, { type ActivityItem } from "@/components/HistoryList";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const org = await getCurrentOrg(user.id);
  if (!org) redirect("/projects");

  const rawLogs = await prisma.activityLog.findMany({
    where: { orgId: org.orgId },
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const logs = JSON.parse(JSON.stringify(rawLogs)) as ActivityItem[];

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">変更履歴</h1>
      <p className="mb-6 text-sm text-neutral-400">
        タスク・マイルストーン・プロジェクトの変更を記録しています（最新200件）。コメント・添付・組織設定は対象外です。
      </p>
      <HistoryList logs={logs} canRevert={org.role === "ADMIN"} />
    </div>
  );
}
