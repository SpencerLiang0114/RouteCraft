import type { Metadata } from "next";
import { ShareRouteClient } from "@/components/ShareRouteClient";
import { loadShare } from "@/lib/api-client/shares";

type SharePageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  try {
    const share = await loadShare(token);
    const route = share.route;
    const description = `${route.distanceKm} km · ${route.elevationGainM} m gain`;
    return {
      title: `${route.name} · RouteCraft`,
      description,
      openGraph: {
        title: route.name,
        description,
        type: "website",
      },
    };
  } catch {
    return {
      title: "Shared route · RouteCraft",
      description: "A RouteCraft shared route.",
    };
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  let initialShare = null;
  try {
    initialShare = await loadShare(token);
  } catch {
    initialShare = null;
  }
  return <ShareRouteClient token={token} initialShare={initialShare} />;
}
