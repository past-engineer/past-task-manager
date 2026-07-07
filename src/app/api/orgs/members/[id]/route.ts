import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

const ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;

async function adminGuard(userId: string) {
  const ctx = await requireOrgContext(userId);
  if (ctx.role !== "ADMIN") return null;
  return ctx;
}

/** 最後の管理者を消さないためのチェック */
async function isLastAdmin(orgId: string, memberId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
  });
  if (!member || member.role !== "ADMIN") return false;
  const adminCount = await prisma.organizationMember.count({
    where: { orgId, role: "ADMIN" },
  });
  return adminCount <= 1;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const ctx = await adminGuard(userId);
    if (!ctx) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const role = ROLES.includes(body.role) ? body.role : null;
    if (!role) {
      return NextResponse.json({ error: "BAD_ROLE" }, { status: 400 });
    }
    const member = await prisma.organizationMember.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!member) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (role !== "ADMIN" && (await isLastAdmin(ctx.orgId, id))) {
      return NextResponse.json(
        { error: "最後の管理者の権限は変更できません" },
        { status: 400 }
      );
    }
    const updated = await prisma.organizationMember.update({
      where: { id },
      data: { role },
      include: { user: true },
    });
    return NextResponse.json(updated);
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
    const ctx = await adminGuard(userId);
    if (!ctx) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const { id } = await params;
    const member = await prisma.organizationMember.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!member) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (await isLastAdmin(ctx.orgId, id)) {
      return NextResponse.json(
        { error: "最後の管理者は削除できません" },
        { status: 400 }
      );
    }
    await prisma.organizationMember.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
