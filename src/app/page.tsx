import AuthenticatedHome from "@/components/authenticated-home";

export default function Home() {
  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.NEXTAUTH_SECRET,
  );

  return <AuthenticatedHome googleConfigured={googleConfigured} />;
}
