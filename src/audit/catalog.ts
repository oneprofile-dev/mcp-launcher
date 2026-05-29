import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as https from "https";

const CATALOG_URL = "https://www.curatedmcp.com/api/catalog";
const CACHE_DIR = path.join(os.homedir(), ".curatedmcp");
const CACHE_FILE = path.join(CACHE_DIR, "catalog.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CatalogEntry {
  slug: string;
  name: string;
  npm?: string;
}

interface CachedCatalog {
  fetchedAt: number;
  servers: CatalogEntry[];
}

function readCache(): CachedCatalog | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as CachedCatalog;
  } catch {
    return null;
  }
}

function writeCache(data: CachedCatalog): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), "utf-8");
  } catch {
    // Cache write failure is non-fatal
  }
}

function fetchCatalog(): Promise<CatalogEntry[]> {
  return new Promise((resolve) => {
    const req = https.get(CATALOG_URL, { timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          resolve(Array.isArray(json.servers) ? json.servers : []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
  });
}

export async function getCatalog(): Promise<{ slugs: Set<string>; npm: Set<string> }> {
  // Check cache first
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return buildSets(cached.servers);
  }

  // Fetch fresh
  const servers = await fetchCatalog();
  if (servers.length > 0) {
    writeCache({ fetchedAt: Date.now(), servers });
    return buildSets(servers);
  }

  // Fall back to stale cache if fetch failed
  if (cached) return buildSets(cached.servers);

  return { slugs: new Set(), npm: new Set() };
}

function buildSets(servers: CatalogEntry[]): { slugs: Set<string>; npm: Set<string> } {
  const slugs = new Set(servers.map((s) => s.slug.toLowerCase()));
  const npm = new Set(servers.filter((s) => s.npm).map((s) => s.npm as string));
  return { slugs, npm };
}
