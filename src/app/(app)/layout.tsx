import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import Avatar from "@/components/Avatar";
import OrgSwitcher from "@/components/OrgSwitcher";
import { getUserOrgs, getCurrentOrg } from "@/lib/org";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };

  const [memberships, currentOrg] = await Promise.all([
    getUserOrgs(user.id!),
    getCurrentOrg(user.id!),
  ]);
  const orgs = memberships.map((m) => ({
    id: m.orgId,
    name: m.org.name,
    role: m.role,
    logoUrl: m.org.logoUrl ?? null,
  }));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/projects" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="past" className="h-[18px] w-auto" />
              <span className="text-[10px] uppercase tracking-[0.28em] text-neutral-400">
                task manager
              </span>
            </Link>
            {orgs.length > 0 && (
              <OrgSwitcher
                orgs={orgs}
                currentOrgId={currentOrg?.orgId ?? null}
              />
            )}
            <nav className="flex items-center gap-5 text-[13px] tracking-wide">
              <Link
                href="/projects"
                className="border-b border-transparent pb-0.5 text-neutral-500 transition hover:border-neutral-800 hover:text-neutral-900"
              >
                プロジェクト
              </Link>
              <Link
                href="/gantt"
                className="border-b border-transparent pb-0.5 text-neutral-500 transition hover:border-neutral-800 hover:text-neutral-900"
              >
                全プロジェクトスケジュール
              </Link>
              <Link
                href="/schedule"
                className="border-b border-transparent pb-0.5 text-neutral-500 transition hover:border-neutral-800 hover:text-neutral-900"
              >
                メンバースケジュール
              </Link>
              <Link
                href="/settings"
                className="border-b border-transparent pb-0.5 text-neutral-500 transition hover:border-neutral-800 hover:text-neutral-900"
              >
                設定
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-neutral-500 sm:block">
              {user.name ?? user.email}
            </span>
            <Avatar user={user} size={26} />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="border-b border-transparent pb-0.5 text-[13px] text-neutral-400 transition hover:border-neutral-800 hover:text-neutral-900"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
