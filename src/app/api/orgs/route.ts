import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { getUserOrgs } from "@/lib/org";

export async function GET() {
  try {
    const userId = await requireUserId();
    const memberships = await getUserOrgs(userId);
    return NextResponse.json(
      memberships.map((m) => ({
        id: m.orgId,
        name: m.org.name,
        role: m.role,
      }))
    );
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

// 組織を作成（作成者が管理者になる）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    const org = await prisma.organization.create({
      data: {
        name,
        members: { create: { userId, role: "ADMIN" } },
        setting: { create: {} },
      },
    });
    return NextResponse.json({ id: org.id, name: org.name }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
