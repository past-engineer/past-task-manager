// 既存データを組織「past」に移行するスクリプト（1回だけ実行）
// 実行: node scripts/backfill-org.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. 組織「past」を取得 or 作成
  let org = await prisma.organization.findFirst({ where: { name: "past" } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: "past" } });
    console.log(`組織「past」を作成しました (${org.id})`);
  } else {
    console.log(`組織「past」は既に存在します (${org.id})`);
  }

  // 2. 既存の全ユーザーを管理者として追加
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  for (const u of users) {
    await prisma.organizationMember.upsert({
      where: { orgId_userId: { orgId: org.id, userId: u.id } },
      update: {},
      create: { orgId: org.id, userId: u.id, role: "ADMIN" },
    });
    console.log(`メンバー追加(ADMIN): ${u.email}`);
  }

  // 3. 未所属のプロジェクト/フォルダを past に紐付け
  const p = await prisma.project.updateMany({
    where: { orgId: null },
    data: { orgId: org.id },
  });
  const f = await prisma.projectFolder.updateMany({
    where: { orgId: null },
    data: { orgId: org.id },
  });
  console.log(`プロジェクト ${p.count} 件、フォルダ ${f.count} 件を紐付け`);

  // 4. 既存の全体設定を past の設定として紐付け
  const existing = await prisma.workspaceSetting.findFirst({
    where: { orgId: org.id },
  });
  if (!existing) {
    const legacy = await prisma.workspaceSetting.findFirst({
      where: { orgId: null },
    });
    if (legacy) {
      await prisma.workspaceSetting.update({
        where: { id: legacy.id },
        data: { orgId: org.id },
      });
      console.log("既存の全体設定を past に紐付けました");
    }
  }

  console.log("移行完了");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
