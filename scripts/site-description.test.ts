import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siteDescription } from "./site-description";

describe("siteDescription", () => {
  it("uses the intro when there is one", () => {
    assert.equal(siteDescription("Mountains and travel.", ["Iceland"]), "Mountains and travel.");
  });

  it("lists the albums otherwise", () => {
    assert.equal(siteDescription("", ["Iceland"]), "Photos from Iceland.");
    assert.equal(siteDescription("", ["Iceland", "Säuleck", "Triglav"]), "Photos from Iceland, Säuleck, and Triglav.");
  });

  it("lists at most five albums", () => {
    assert.equal(
      siteDescription("", ["A", "B", "C", "D", "E", "F", "G"]),
      "Photos from A, B, C, D, E, and more.",
    );
  });

  it("falls back to a generic description without albums", () => {
    assert.equal(siteDescription("", []), "A photo gallery.");
  });
});
