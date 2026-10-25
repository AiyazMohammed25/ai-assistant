import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { resolveAuthUrl } from "@/lib/resolve-auth-url";

const canonicalAuthUrl = resolveAuthUrl({
  nextAuthUrl: process.env.NEXTAUTH_URL,
  vercel: process.env.VERCEL,
  vercelEnv: process.env.VERCEL_ENV,
  vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
  vercelUrl: process.env.VERCEL_URL,
});
if (canonicalAuthUrl) process.env.NEXTAUTH_URL = canonicalAuthUrl;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
};
