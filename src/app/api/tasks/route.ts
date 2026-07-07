import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";
import { isTaskStatus } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const projectId = (body.projectId ?? "").toString();
    const title = (body.title ?? "").toString().trim();

    if (!projectId || !title) {
      return NextResponse.json(
        { error: "projectId and title are required" },
        { status: 400 }
      );
    }
    if (!canEdit(await getProjectRole(projectId, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const status = isTaskStatus(body.status) ? body.status : "TODO";

    // 同ステータス列の末尾に配置
    const last = await prisma.task.findFirst({
      where: { projectId, status, parentId: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const task = await prisma.task.create({
      data: {
        projectId,
        title,
        description: body.description?.toString() || null,
        status,
        estimate:
          body.estimate === undefined || body.estimate === null || body.estimate === ""
            ? null
            : Number(body.estimate),
        assigneeId: body.assigneeId?.toString() || null,
        parentId: body.parentId?.toString() || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        position: (last?.position ?? 0) + 1,
      },
      include: { assignee: true },
    });
    return NextResponse.json(task, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
