import { NextResponse } from "next/server";
import { generateRoutes } from "@/backend/routing/routeGenerator";
import type { UserPreferences } from "@/types/route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const preferences = (await request.json()) as UserPreferences;

    if (!preferences.activity || !preferences.routeType) {
      return NextResponse.json(
        { routes: [], message: "activity and routeType are required." },
        { status: 400 },
      );
    }

    const { lat, lng } = preferences.startPoint ?? {};
    if (
      lat == null || lng == null ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180
    ) {
      return NextResponse.json(
        { routes: [], message: "Invalid or missing start coordinates." },
        { status: 400 },
      );
    }

    if (preferences.endPoint != null) {
      const { lat: eLat, lng: eLng } = preferences.endPoint;
      if (
        !Number.isFinite(eLat) || eLat < -90 || eLat > 90 ||
        !Number.isFinite(eLng) || eLng < -180 || eLng > 180
      ) {
        return NextResponse.json(
          { routes: [], message: "Invalid end coordinates." },
          { status: 400 },
        );
      }
    }

    const routes = await generateRoutes(preferences);

    return NextResponse.json({ routes });
  } catch (error) {
    console.error("Route generation error:", error);
    return NextResponse.json(
      { routes: [], message: "Could not generate routes." },
      { status: 500 },
    );
  }
}
