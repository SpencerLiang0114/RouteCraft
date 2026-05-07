import { NextResponse } from "next/server";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2 || query.length > 200) {
    return NextResponse.json({ results: [] });
  }

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "RouteCraft local address search",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return NextResponse.json(
      { results: [], message: `Address search failed with ${response.status}.` },
      { status: 502 },
    );
  }

  const data = (await response.json()) as NominatimResult[];

  return NextResponse.json({
    results: data
      .map((item) => ({
        label: item.display_name,
        point: {
          lat: Number(item.lat),
          lng: Number(item.lon),
        },
        category: [item.class, item.type].filter(Boolean).join(" / "),
      }))
      .filter((item) => Number.isFinite(item.point.lat) && Number.isFinite(item.point.lng)),
  });
}
