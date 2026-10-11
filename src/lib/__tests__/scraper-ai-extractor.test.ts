import { describe, it, expect, vi, afterEach } from "vitest";

// The xAI client is mocked: these tests must never reach the real model.
const create = vi.fn();
vi.mock("@/lib/xai/client", () => ({
  createXAIClient: () => ({ chat: { completions: { create } } }),
}));

import { extractAmenitiesWithAI } from "../scraper/ai-extractor";

afterEach(() => {
  vi.unstubAllEnvs();
  create.mockReset();
  vi.restoreAllMocks();
});

const reply = (content: string) => ({ choices: [{ message: { content } }] });

describe("extractAmenitiesWithAI — failures are reported, not swallowed", () => {
  it("flags a missing API key", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await extractAmenitiesWithAI("<p>Pool</p>", "https://tower.com");
    expect(result.amenities).toEqual([]);
    expect(result.error).toMatch(/XAI_API_KEY/);
    expect(create).not.toHaveBeenCalled();
  });

  it("flags a model error", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValue(new Error("429 Too Many Requests"));
    const result = await extractAmenitiesWithAI("<p>Pool</p>", "https://tower.com");
    expect(result.error).toBe("429 Too Many Requests");
  });

  it("flags a response with no JSON", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    create.mockResolvedValue(reply("Sorry, I can't help with that."));
    const result = await extractAmenitiesWithAI("<p>Pool</p>", "https://tower.com");
    expect(result.error).toMatch(/no JSON/);
  });

  it("returns amenities without an error on success, even when there are none", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    create.mockResolvedValueOnce(reply('{"amenities":[{"name":"Rooftop Pool","category":"outdoor"}]}'));
    expect(await extractAmenitiesWithAI("<p>Pool</p>", "https://tower.com")).toEqual({
      amenities: [{ name: "Rooftop Pool", category: "outdoor" }],
      pet_policy: undefined,
      parking_policy: undefined,
    });
    create.mockResolvedValueOnce(reply('{"amenities":[]}'));
    expect((await extractAmenitiesWithAI("<p></p>", "https://tower.com")).error).toBeUndefined();
  });
});
