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
    headers: { "User-Agent": "@curatedmcp/launcher/0.1.0" },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Server "${slug}" not found`);
    }
    throw new Error(`Failed to fetch details: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return {
    slug: data.slug,
    name: data.name,
    tagline: data.tagline,
    description: data.description,
    category: data.category,
    pricingType: data.pricingType,
    rating: data.rating,
    downloadCount: data.downloadCount,
    repo: data.repository,
    docsUrl: data.documentationUrl,
  };
}
