import { Suspense } from "react";
import { RouteResultsClient } from "@/components/RouteResultsClient";

export default function ResultsPage() {
  return (
    <Suspense>
      <RouteResultsClient />
    </Suspense>
  );
}
