import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const API_URL =
  process.env.CURATOR_API_URL || "https://www.curatedmcp.com";

const CONFIG_DIR = join(homedir(), ".curatedmcp");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");

export interface StoredAuth {
  token: string;
  userId?: string;
  email?: string;
  savedAt: string;
}

export interface WhoAmI {
  userId: string;
  email?: string | null;
  teams: { slug: string; name: string; role: string }[];
}

export function loadAuth(): StoredAuth | null {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as StoredAuth;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return process.env.CURATEDMCP_TOKEN || loadAuth()?.token || null;
}

export function saveAuth(auth: StoredAuth): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), "utf-8");
  try {
    chmodSync(AUTH_FILE, 0o600);
  } catch {
    // chmod may not be supported (e.g. Windows) — non-fatal.
  }
}

export function clearAuth(): void {
  try {
    writeFileSync(AUTH_FILE, JSON.stringify({ token: "" }), "utf-8");
  } catch {
    // ignore
  }
}

/** Validate a token against the control plane. Returns identity + teams or null. */
export async function whoami(token: string): Promise<WhoAmI | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/cli/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as WhoAmI;
  } catch {
    return null;
  }
}
