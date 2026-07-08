import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";
import { logActivity } from "@/lib/audit";

export async function GET() {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const projects = await prisma.project.findMany({
      where: { orgId: ctx.orgId },
      include: {
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role === "VIEWER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name,
        orgId: ctx.orgId,
        description: body.description?.toString() || null,
        color: body.color?.toString() || "#4f46e5",
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });

    await logActivity({
      orgId: ctx.orgId,
      actorId: userId,
      entity: "project",
      entityId: project.id,
      action: "create",
      summary: `プロジェクト「${name}」を作成`,
      after: {
        orgId: ctx.orgId,
        name,
        description: project.description,
        color: project.color,
      },
    });

    // テンプレートからタスク・マイルストーンを生成
    if (body.templateId) {
      const template = await prisma.projectTemplate.findFirst({
        where: { id: body.templateId.toString(), orgId: ctx.orgId },
        include: {
          tasks: { orderBy: { position: "asc" } },
          milestones: true,
        },
      });
      if (template) {
        const base = body.startDate ? new Date(body.startDate) : null;
        const baseMs =
          base && !isNaN(base.getTime()) ? base.getTime() : null;
        const DAY = 86_400_000;

        if (template.tasks.length > 0) {
          await prisma.task.createMany({
            data: template.tasks.map((t, i) => {
              const start =
                baseMs !== null && t.startOffset !== null
                  ? new Date(baseMs + t.startOffset * DAY)
                  : null;
              const end =
                start && t.duration !== null
                  ? new Date(
                      start.getTime() + Math.max(t.duration - 1, 0) * DAY
                    )
                  : null;
              return {
                projectId: project.id,
                title: t.title,
                estimate: t.estimate,
                status: "TODO" as const,
                position: i + 1,
                startDate: start,
                endDate: end,
              };
            }),
          });
        }
        if (baseMs !== null && template.milestones.length > 0) {
          await prisma.milestone.createMany({
            data: template.milestones.map((m) => ({
              projectId: project.id,
              title: m.title,
              date: new Date(baseMs + m.offset * DAY),
            })),
          });
        }
      }
    }

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
