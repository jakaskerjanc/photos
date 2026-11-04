import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAlbumNotes } from "./album-notes";

describe("parseAlbumNotes", () => {
  it("reads the cover and the description", () => {
    const notes = parseAlbumNotes("---\ncover: DSC02167.avif\n---\nTwo weeks driving\nthe Ring Road.\n", "Iceland");
    assert.deepEqual(notes, { cover: "DSC02167.avif", description: "Two weeks driving the Ring Road.", warnings: [] });
  });

  it("keeps paragraphs separated by blank lines", () => {
    const notes = parseAlbumNotes("First day.\n\n\nSecond   day.\n", "Iceland");
    assert.equal(notes.description, "First day.\n\nSecond day.");
  });

  it("accepts a description without front matter, and front matter without a description", () => {
    assert.deepEqual(parseAlbumNotes("Just text.", "a"), { cover: undefined, description: "Just text.", warnings: [] });
    assert.deepEqual(parseAlbumNotes("---\ncover: 'a b.jpg'\n---\n", "a"), {
      cover: "a b.jpg",
      description: undefined,
      warnings: [],
    });
  });

  it("handles Windows line endings and a byte order mark", () => {
    const notes = parseAlbumNotes("﻿---\r\ncover: a.jpg\r\n---\r\nHello\r\n", "a");
    assert.deepEqual(notes, { cover: "a.jpg", description: "Hello", warnings: [] });
  });

  it("warns about unknown fields", () => {
    const notes = parseAlbumNotes("---\ncover: a.jpg\ntitle: Something\n---\n", 'album folder "x"');
    assert.equal(notes.cover, "a.jpg");
    assert.deepEqual(notes.warnings, [
      'Ignoring "title: Something" in album folder "x": only "cover: <photo file name>" is supported.',
    ]);
  });
});
