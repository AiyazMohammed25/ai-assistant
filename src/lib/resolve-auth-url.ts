export type AuthUrlEnvironment = {
  nextAuthUrl?: string;
  vercel?: string;
  vercelEnv?: string;
  vercelProjectProductionUrl?: string;
  vercelBranchUrl?: string;
  vercelUrl?: string;
};

function isLocalUrl(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const hostname = new URL(candidate).hostname.toLowerCase();
    return hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function getOrigin(hostname: string | undefined): string | null {
  const host = hostname?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!host || host.includes("/") || host.includes("@")) return null;
  try {
    return new URL(`https://${host}`).origin;
  } catch {
    return null;
  }
}

export function resolveAuthUrl(environment: AuthUrlEnvironment): string | undefined {
  const configuredUrl = environment.nextAuthUrl?.trim();
  const isVercel = environment.vercel === "1" || Boolean(environment.vercelUrl);
  if (!isVercel || !isLocalUrl(configuredUrl)) return configuredUrl;

  const isProduction = environment.vercelEnv === "production";
  const host = isProduction
    ? environment.vercelProjectProductionUrl || environment.vercelUrl
    : environment.vercelBranchUrl || environment.vercelUrl || environment.vercelProjectProductionUrl;
  return getOrigin(host) ?? configuredUrl;
}
