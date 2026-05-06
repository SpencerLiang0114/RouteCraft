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

    const routes = await generateRoutes(preferences);

    return NextResponse.json({ routes });
  } catch (error) {
    return NextResponse.json(
      {
        routes: [],
        message: error instanceof Error ? error.message : "Could not generate routes.",
      },
      { status: 500 },
    );
  }
}
