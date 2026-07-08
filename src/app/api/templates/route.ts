import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";

const SEED_TEMPLATES = [
  {
    name: "Web制作（新規サイト）",
    description: "デザイン〜コーディング〜WP組み込み〜公開までの標準フロー",
    color: "#4f46e5",
    tasks: [
      { title: "デザイン", estimate: 40, startOffset: 0, duration: 10 },
      { title: "コーディング", estimate: 40, startOffset: 10, duration: 10 },
      { title: "WP組み込み", estimate: 24, startOffset: 20, duration: 5 },
      { title: "検証・修正", estimate: 16, startOffset: 25, duration: 4 },
    ],
    milestones: [
      { title: "デザインFIX", offset: 10 },
      { title: "テストアップ", offset: 25 },
      { title: "納品", offset: 29 },
      { title: "公開", offset: 30 },
    ],
  },
  {
    name: "LP・キャンペーン",
    description: "短期のLP制作・シーズンキャンペーン向け",
    color: "#0ea5e9",
    tasks: [
      { title: "デザイン", estimate: 16, startOffset: 0, duration: 5 },
      { title: "コーディング", estimate: 16, startOffset: 5, duration: 4 },
      { title: "検証・修正", estimate: 8, startOffset: 9, duration: 1 },
    ],
    milestones: [
      { title: "デザインFIX", offset: 5 },
      { title: "テストアップ", offset: 9 },
      { title: "公開", offset: 10 },
    ],
  },
  {
    name: "保守・改修",
    description: "既存サイトの改修・小規模対応",
    color: "#10b981",
    tasks: [
      { title: "調査・見積", estimate: 4, startOffset: 0, duration: 2 },
      { title: "実装", estimate: 12, startOffset: 2, duration: 3 },
      { title: "検証", estimate: 4, startOffset: 5, duration: 1 },
    ],
    milestones: [
      { title: "テストアップ", offset: 5 },
      { title: "公開", offset: 6 },
    ],
  },
];

export async function GET() {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    const templates = await prisma.projectTemplate.findMany({
      where: { orgId: ctx.orgId },
      include: {
        tasks: { orderBy: { position: "asc" } },
        milestones: { orderBy: { offset: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(templates);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

// テンプレート作成。body: { name } または { seed: true }（初期3種を投入）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role === "VIEWER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();

    if (body.seed) {
      for (const t of SEED_TEMPLATES) {
        const exists = await prisma.projectTemplate.findFirst({
          where: { orgId: ctx.orgId, name: t.name },
        });
        if (exists) continue;
        await prisma.projectTemplate.create({
          data: {
            orgId: ctx.orgId,
            name: t.name,
            description: t.description,
            color: t.color,
            tasks: {
              create: t.tasks.map((task, i) => ({ ...task, position: i })),
            },
            milestones: { create: t.milestones },
          },
        });
      }
      return NextResponse.json({ ok: true, seeded: true }, { status: 201 });
    }

    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    const template = await prisma.projectTemplate.create({
      data: { orgId: ctx.orgId, name },
      include: { tasks: true, milestones: true },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    console.error("[templates POST]", e);
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
