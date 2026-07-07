import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUserId } from "@/lib/data";
import { getOrgRole, ORG_COOKIE } from "@/lib/org";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const orgId = (body.orgId ?? "").toString();
    if (!orgId || !(await getOrgRole(orgId, userId))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const store = await cookies();
    store.set(ORG_COOKIE, orgId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 400 });
  }
}
