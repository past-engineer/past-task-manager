import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessTask } from "@/lib/data";
import { getTaskRole, canEdit } from "@/lib/org";
import { isTaskStatus } from "@/lib/constants";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await userCanAccessTask(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: true,
        subtasks: {
          include: { assignee: true },
          orderBy: { position: "asc" },
        },
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" },
        },
        attachments: {
          include: { uploader: true },
          orderBy: { createdAt: "desc" },
        },
        dailyHours: { orderBy: { date: "asc" } },
      },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!canEdit(await getTaskRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();

    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (body.title !== undefined) data.title = body.title.toString();
    if (body.description !== undefined)
      data.description = body.description?.toString() || null;
    if (body.status !== undefined && isTaskStatus(body.status))
      data.status = body.status;
    if (body.assigneeId !== undefined)
      data.assigneeId = body.assigneeId || null;
    if (body.estimate !== undefined)
      data.estimate =
        body.estimate === null || body.estimate === ""
          ? null
          : Number(body.estimate);
    if (body.spent !== undefined)
      data.spent =
        body.spent === null || body.spent === "" ? null : Number(body.spent);
    if (body.dueDate !== undefined)
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.startDate !== undefined)
      data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined)
      data.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.position !== undefined) data.position = Number(body.position);
    if (body.flexible !== undefined) data.flexible = !!body.flexible;

    const task = await prisma.task.update({
      where: { id },
      data,
      include: { assignee: true },
    });
    return NextResponse.json(task);
  } catch {
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
    if (!canEdit(await getTaskRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
