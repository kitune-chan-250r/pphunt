import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reactGAMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  event: vi.fn(),
}));

vi.mock("react-ga4", () => ({ default: reactGAMock }));

describe("Google Analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("PROD", true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initializes the GA4 tag only once", async () => {
    const { initializeAnalytics } = await import("./googleAnalytics");

    initializeAnalytics();
    initializeAnalytics();

    expect(reactGAMock.initialize).toHaveBeenCalledOnce();
    expect(reactGAMock.initialize).toHaveBeenCalledWith("G-JQRSE94FW4");
    expect(reactGAMock.event).not.toHaveBeenCalled();
  });

  it("sends typed app events to GA4 with only event parameters", async () => {
    const { initializeAnalytics, trackEvent } = await import("./googleAnalytics");

    initializeAnalytics();
    trackEvent({
      event: "player_search",
      status: "success",
      query_length_bucket: "3-5",
      result_count: 2,
    });

    expect(reactGAMock.event).toHaveBeenLastCalledWith("player_search", {
      status: "success",
      query_length_bucket: "3-5",
      result_count: 2,
    });
  });
});
