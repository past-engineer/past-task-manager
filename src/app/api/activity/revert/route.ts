import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/data";
import { requireOrgContext } from "@/lib/org";
import { revertToLog } from "@/lib/audit";

// 指定した履歴の時点まで戻す（管理者のみ）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const ctx = await requireOrgContext(userId);
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const logId = (body.logId ?? "").toString();
    if (!logId) {
      return NextResponse.json({ error: "logId is required" }, { status: 400 });
    }
    const result = await revertToLog(ctx.orgId, logId, userId);
    if ("error" in result) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[activity revert]", e);
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
