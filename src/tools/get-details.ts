const API_URL = process.env.CURATOR_API_URL || "https://www.curatedmcp.com";

export interface ServerDetails {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  pricingType: string;
  rating: number | null;
  downloadCount: number;
  repo?: string;
  docsUrl?: string;
}

export async function getServerDetails(slug: string): Promise<ServerDetails> {
  const url = `${API_URL}/api/servers/${slug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "curatedmcp/2.0.0" },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Server "${slug}" not found`);
    }
    throw new Error(`Failed to fetch details: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    slug: data.slug as string,
    name: data.name as string,
    tagline: data.tagline as string,
    description: data.description as string,
    category: data.category as string,
    pricingType: data.pricingType as string,
    rating: data.rating as number | null,
    downloadCount: data.downloadCount as number,
    repo: data.repository as string | undefined,
    docsUrl: data.documentationUrl as string | undefined,
  };
}
