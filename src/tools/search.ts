const API_URL = process.env.CURATOR_API_URL || "https://www.curatedmcp.com";

interface SearchResult {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  pricing: string;
  rating: number | null;
  downloads: number;
}

export async function searchServers({
  query,
  category,
  limit = 10,
}: {
  query: string;
  category?: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  if (category) params.set("category", category);
  params.set("limit", Math.min(limit, 50).toString());

  const url = `${API_URL}/api/launcher/search?${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "@curatedmcp/launcher/0.1.0" },
  });

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as SearchResult[];
}
