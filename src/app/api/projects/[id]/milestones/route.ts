import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessProject } from "@/lib/data";
import { getProjectRole, canEdit } from "@/lib/org";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await userCanAccessProject(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const milestones = await prisma.milestone.findMany({
      where: { projectId: id },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(milestones);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!canEdit(await getProjectRole(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const title = (body.title ?? "").toString().trim();
    const date = body.date ? new Date(body.date) : null;
    if (!title || !date || isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "title and date are required" },
        { status: 400 }
      );
    }
    const milestone = await prisma.milestone.create({
      data: { projectId: id, title, date },
    });
    return NextResponse.json(milestone, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
