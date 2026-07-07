import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, userCanAccessProject } from "@/lib/data";

// メンバー一覧
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
    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

// メールアドレスでメンバー追加（既にサインイン済みのユーザーのみ）
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await userCanAccessProject(id, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const email = (body.email ?? "").toString().trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) {
      return NextResponse.json(
        { error: "このメールのユーザーが見つかりません（一度ログインが必要です）" },
        { status: 404 }
      );
    }
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: target.id } },
      update: {},
      create: { projectId: id, userId: target.id, role: "MEMBER" },
      include: { user: true },
    });
    return NextResponse.json(member, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
