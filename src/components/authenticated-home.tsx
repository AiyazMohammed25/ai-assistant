"use client";

import { useSession } from "next-auth/react";
import ChatWorkspace from "@/components/chat-workspace";
import SignInScreen from "@/components/sign-in-screen";

type AuthenticatedHomeProps = {
  googleConfigured: boolean;
};

export default function AuthenticatedHome({
  googleConfigured,
}: AuthenticatedHomeProps) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <main className="auth-loading">
        <span className="workspace-brand-mark">
          <span className="auth-loading-spark">✳</span>
        </span>
        <span>Opening your space…</span>
      </main>
    );
  }

  if (!session?.user?.email) {
    return <SignInScreen googleConfigured={googleConfigured} />;
  }

  return <ChatWorkspace user={session.user} />;
}
