import { expect, test } from "bun:test";
import official from "../../official-owners.json";
import { blockedReason, originOf, placementOf, reservedIdReason } from "./discover-blends.ts";

test("origin comes from the owner id, never the login", () => {
  expect(originOf(329572928, official)).toBe("official");
  expect(originOf(1, official)).toBe("community");
  expect(originOf(undefined, official)).toBe("community");
});

test("a community id may not use one of our prefixes", () => {
  expect(reservedIdReason("acrylblends.notes", official)).toContain("acrylblends.");
  expect(reservedIdReason("Acryl.x", official)).toContain("acryl.");
  expect(reservedIdReason("inboxxobni.notes", official)).toBeUndefined();
});

test("the blocklist matches an owner or one repository, any case", () => {
  const blocklist = { owners: ["Bad"], repositories: ["someone/Evil-Blend"] };
  expect(blockedReason("bad/x", blocklist)).toContain("owner bad");
  expect(blockedReason("Someone/evil-blend", blocklist)).toBe("it is on the blocklist");
  expect(blockedReason("someone/good", blocklist)).toBeUndefined();
});

test("placement: category by address or name, subcategory from a topic", () => {
  expect(placementOf("gaming", ["acrylblends-blend", "games"])).toEqual({ category: "Gaming", subcategory: "Games" });
  expect(placementOf("Gaming", ["acrylblends-blend"])).toEqual({ category: "Gaming" });
  expect(placementOf("productivity", [])).toContain("not one of the categories");
  expect(placementOf(undefined, [])).toContain("no metadata.category");
});
