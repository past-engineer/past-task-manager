import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

async function guard(userId: string, templateId: string) {
  const ctx = await requireOrgContext(userId);
  if (ctx.role === "VIEWER") return null;
  return prisma.projectTemplate.findFirst({
    where: { id: templateId, orgId: ctx.orgId },
  });
}

// テンプレート全体を置き換え更新
// body: { name, description, color, tasks: [...], milestones: [...] }
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await guard(userId, id))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    type TaskIn = {
      title?: unknown;
      estimate?: unknown;
      startOffset?: unknown;
      duration?: unknown;
    };
    type MsIn = { title?: unknown; offset?: unknown };

    const tasks = (Array.isArray(body.tasks) ? body.tasks : [])
      .map((t: TaskIn) => ({
        title: (t.title ?? "").toString().trim(),
        estimate: num(t.estimate),
        startOffset: num(t.startOffset),
        duration: num(t.duration),
      }))
      .filter((t: { title: string }) => t.title);

    const milestones = (Array.isArray(body.milestones) ? body.milestones : [])
      .map((m: MsIn) => ({
        title: (m.title ?? "").toString().trim(),
        offset: num(m.offset) ?? 0,
      }))
      .filter((m: { title: string }) => m.title);

    const template = await prisma.$transaction(async (tx) => {
      await tx.templateTask.deleteMany({ where: { templateId: id } });
      await tx.templateMilestone.deleteMany({ where: { templateId: id } });
      return tx.projectTemplate.update({
        where: { id },
        data: {
          name,
          description: body.description?.toString() || null,
          color: body.color?.toString() || "#4f46e5",
          tasks: {
            create: tasks.map(
              (t: (typeof tasks)[number], i: number) => ({
                ...t,
                position: i,
              })
            ),
          },
          milestones: { create: milestones },
        },
        include: {
          tasks: { orderBy: { position: "asc" } },
          milestones: { orderBy: { offset: "asc" } },
        },
      });
    });
    return NextResponse.json(template);
  } catch (e) {
    console.error("[templates PUT]", e);
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await guard(userId, id))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    await prisma.projectTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
