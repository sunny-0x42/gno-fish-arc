import { describe, expect, it } from "vitest";
import {
  acceptCountry,
  chainCountryName,
  countryFromCode,
  countryFromPayload,
  flagEmoji,
  loadIpCountry,
  sailorLabel,
} from "./country";

describe("country from the network address", () => {
  it("maps a visitor code to a flag and a realm name when the realm knows it", () => {
    expect(countryFromCode(" vn ")).toEqual({ code: "VN", name: "Vietnam" });
    expect(chainCountryName("Vietnam")).toBe("Vietnam");
    expect(sailorLabel("skipper", "Vietnam")).toBe(`${flagEmoji("VN")} skipper`);
    expect(countryFromCode("XX")).toBeNull();
    expect(countryFromCode("T1")).toBeNull();
    expect(acceptCountry("Atlantis")).toBe(false);
    expect(acceptCountry("Sea")).toBe(true);
    expect(acceptCountry("Germany")).toBe(true);
    expect(chainCountryName("Germany")).toBeNull();
  });

  it("reads the same-origin route before the public lookup", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url === "/api/country") return { ok: true, json: async () => ({ code: "DE" }) };
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;
    expect(await loadIpCountry(fetchImpl)).toEqual({ code: "DE", name: "Germany" });
    expect(calls).toEqual(["/api/country"]);
    expect(countryFromPayload({ country: "JP" })).toEqual({ code: "JP", name: "Japan" });
  });

  it("uses the public lookup when the site route is missing", async () => {
    const fetchImpl = (async (url: string) => {
      if (url === "/api/country") return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ country: "FR" }) };
    }) as unknown as typeof fetch;
    expect(await loadIpCountry(fetchImpl)).toEqual({ code: "FR", name: "France" });
  });
});
