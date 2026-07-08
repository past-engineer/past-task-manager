import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getWorkspaceSettings } from "@/lib/data";
import { getCurrentOrg } from "@/lib/org";
import SettingsBoard from "@/components/SettingsBoard";
import TemplateManager from "@/components/TemplateManager";
import type {
  DayOffLite,
  OrgHolidayLite,
  OrgMemberLite,
  TemplateLite,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const userId = user.id;

  const org = await getCurrentOrg(userId);
  if (!org) redirect("/projects");

  const { nonWorkingWeekdays, dailyWorkHours } = await getWorkspaceSettings(
    org.orgId
  );

  const orgRecord = await prisma.organization.findUnique({
    where: { id: org.orgId },
    select: { logoUrl: true },
  });

  const rawMembers = await prisma.organizationMember.findMany({
    where: { orgId: org.orgId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const orgMembers = JSON.parse(JSON.stringify(rawMembers)) as OrgMemberLite[];

  const rawDaysOff = await prisma.dayOff.findMany({
    where: { userId: { in: rawMembers.map((m) => m.userId) } },
    orderBy: { date: "asc" },
  });
  const daysOff = JSON.parse(JSON.stringify(rawDaysOff)) as DayOffLite[];

  const rawHolidays = await prisma.orgHoliday.findMany({
    where: { orgId: org.orgId },
    orderBy: { date: "asc" },
  });
  const orgHolidays = JSON.parse(
    JSON.stringify(rawHolidays)
  ) as OrgHolidayLite[];

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">設定</h1>
      <p className="mb-6 text-sm text-neutral-400">
        組織「{org.orgName}」の設定
        {org.role !== "ADMIN" &&
          "（組織設定の変更は管理者のみ行えます）"}
      </p>
      <SettingsBoard
        initialNonWorkingWeekdays={nonWorkingWeekdays}
        initialDailyWorkHours={dailyWorkHours}
        initialOrgHolidays={orgHolidays}
        orgMembers={orgMembers}
        initialDaysOff={daysOff}
        myUserId={userId}
        myRole={org.role}
        initialLogoUrl={orgRecord?.logoUrl ?? null}
      />
      <div className="mt-8 max-w-3xl">
        <TemplateManager
          initialTemplates={
            JSON.parse(
              JSON.stringify(
                await prisma.projectTemplate.findMany({
                  where: { orgId: org.orgId },
                  include: {
                    tasks: { orderBy: { position: "asc" } },
                    milestones: { orderBy: { offset: "asc" } },
                  },
                  orderBy: { createdAt: "asc" },
                })
              )
            ) as TemplateLite[]
          }
          canManage={org.role !== "VIEWER"}
        />
      </div>
    </div>
  );
}
