"use client";

import { signIn } from "next-auth/react";
import { ArrowRight, Globe2, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type SignInScreenProps = {
  googleConfigured: boolean;
};

export default function SignInScreen({
  googleConfigured,
}: SignInScreenProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError("");
    setLoading(true);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Google sign-in could not be started. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="signin-page">
      <div className="signin-glow signin-glow-one" />
      <div className="signin-glow signin-glow-two" />
      <div className="signin-layout">
        <section className="signin-copy">
          <Link className="brand-lockup" href="/" aria-label="Cybertron home">
            <span className="brand-mark">
              <Sparkles size={19} strokeWidth={2.2} />
            </span>
            <span>Cybertron</span>
          </Link>
          <div className="signin-headline">
            <div className="eyebrow">
              <span className="status-dot" />
              YOUR THINKING, IN CYBERTRON
            </div>
            <h1>
              A little more
              <br />
              <span>clarity</span> every day.
            </h1>
            <p>
              One thoughtful space for big questions, quick answers, and ideas
              that are still taking shape.
            </p>
          </div>
          <div className="signin-features">
            <div className="signin-feature">
              <span className="feature-icon">
                <Sparkles size={17} />
              </span>
              <div>
                <strong>Think things through</strong>
                <span>Pick up where your curiosity takes you.</span>
              </div>
            </div>
            <div className="signin-feature">
              <span className="feature-icon feature-icon-blue">
                <Globe2 size={17} />
              </span>
              <div>
                <strong>Bring the world in</strong>
                <span>Ground answers in what’s happening now.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="signin-card" aria-labelledby="signin-title">
          <div className="signin-card-orbit">
            <div className="orbit-ring orbit-ring-one" />
            <div className="orbit-ring orbit-ring-two" />
            <div className="orbit-core">
              <Sparkles size={24} />
            </div>
            <span className="orbit-star orbit-star-one">✳</span>
            <span className="orbit-star orbit-star-two">✦</span>
          </div>
          <div className="signin-card-copy">
            <span className="card-kicker">A clearer head starts here</span>
            <h2 id="signin-title">Make room for better questions.</h2>
            <p>
              Sign in to start a conversation. Your chats stay private to your
              account.
            </p>
          </div>
          <button
            className="google-signin-button"
            type="button"
            onClick={handleSignIn}
            disabled={!googleConfigured || loading}
          >
            <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.92 46.98 31.87 46.98 24.55Z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.75-4.59l-7.98-6.19A23.86 23.86 0 0 0 0 24c0 3.87.93 7.54 2.56 10.78l7.97-6.19Z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.45-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
              />
            </svg>
            <span>
              {loading ? "Opening Google…" : "Continue with Google"}
            </span>
            {!loading && <ArrowRight size={17} />}
          </button>
          {!googleConfigured && (
            <p className="signin-notice" role="status">
              Sign-in is not configured yet. Add GOOGLE_CLIENT_ID,
              GOOGLE_CLIENT_SECRET, and NEXTAUTH_SECRET to your environment.
            </p>
          )}
          {error && (
            <p className="signin-error" role="alert">
              {error}
            </p>
          )}
          <div className="signin-card-footer">
            <LockKeyhole size={13} />
            <span>Your conversations are private and secure</span>
          </div>
        </section>
      </div>
      <footer className="signin-footer">
        <span>© {new Date().getFullYear()} Cybertron AI</span>
        <span>Curiosity, with a little more clarity.</span>
      </footer>
    </main>
  );
}
