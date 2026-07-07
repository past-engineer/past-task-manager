import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

const ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;
type RoleStr = (typeof ROLES)[number];

export async function GET() {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const members = await prisma.organizationMember.findMany({
      where: { orgId: ctx.orgId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

// メンバー招待（既にログイン済みのユーザーのみ）。管理者専用
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const email = (body.email ?? "").toString().trim().toLowerCase();
    const role: RoleStr = ROLES.includes(body.role) ? body.role : "MEMBER";
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) {
      return NextResponse.json(
        {
          error:
            "このメールのユーザーが見つかりません（一度ログインが必要です）",
        },
        { status: 404 }
      );
    }
    const member = await prisma.organizationMember.upsert({
      where: { orgId_userId: { orgId: ctx.orgId, userId: target.id } },
      update: { role },
      create: { orgId: ctx.orgId, userId: target.id, role },
      include: { user: true },
    });
    return NextResponse.json(member, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
