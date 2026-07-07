import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge(middleware)でも読み込める軽量設定。
// Prisma アダプタなど Node 専用の依存はここに含めない。
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [Google],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
