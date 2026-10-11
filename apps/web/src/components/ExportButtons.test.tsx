import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShare } from "@/lib/api-client/shares";
import { useAuthStore } from "@/store/authStore";
import type { RouteCandidate, SavedRoute } from "@/types/route";
import { ExportButtons, getShareButtonState } from "./ExportButtons";

vi.mock("@/lib/api-client/shares", () => ({
  createShare: vi.fn(),
}));

const candidate: RouteCandidate = {
  id: "generated-1",
  source: "generated",
  name: "Test route",
  activity: "running",
  geometry: [{ lat: 1, lng: 2 }],
  distanceKm: 1,
  estimatedDurationMin: 10,
  elevationGainM: 5,
  metrics: {
    parkScore: 0,
    shadeScore: 0,
    safetyScore: 0,
    explorationScore: 0,
    sceneryScore: 0,
    elevationScore: 0,
    distanceScore: 0,
    totalScore: 0,
  },
  explanation: "A test route.",
};

const savedRoute: SavedRoute = { ...candidate, id: "saved-1", savedAt: "2026-10-10T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ status: "authenticated", user: null, error: null });
});

describe("ExportButtons share action", () => {
  it("requires an unsaved route to be saved before sharing", async () => {
    render(<ExportButtons route={candidate} />);
    const shareButton = screen.getByRole("button", { name: "Save route to share" });

    expect(shareButton).toHaveProperty("disabled", true);
    expect(shareButton.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Save this route before sharing it.")).toBeTruthy();
    expect(createShare).not.toHaveBeenCalled();

    await userEvent.setup().click(shareButton);
  });

  it("keeps the saved-route token share action available", async () => {
    vi.mocked(createShare).mockResolvedValue({
      token: "token-1",
      urlPath: "/share/token-1",
      expiresAt: "2026-10-17T00:00:00Z",
      routeId: savedRoute.id,
    });
    render(<ExportButtons route={savedRoute} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Share link" }));

    await waitFor(() => {
      expect(createShare).toHaveBeenCalledWith(savedRoute.id, 168);
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    });
  });

  it("preserves share errors from the saved-route token API path", async () => {
    vi.mocked(createShare).mockRejectedValue(new Error("server rejected share"));
    render(<ExportButtons route={savedRoute} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Share link" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Share failed" })).toBeTruthy());
  });

  it("does not offer a share link for saved routes without an authenticated session", () => {
    expect(getShareButtonState(true, "anonymous")).toEqual({
      disabled: true,
      label: "Sign in to share",
      explanation: "Sign in before sharing a saved route.",
    });
  });
});
