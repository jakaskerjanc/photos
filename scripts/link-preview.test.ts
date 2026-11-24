import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { AlbumSource } from "./albums";
import { chooseLinkPreviewPhoto, linkPreviewAlt } from "./link-preview";

const root = "/site/photos";
const loose: AlbumSource = { slug: "", title: null, directory: root, fileNames: ["a.jpg", "b.jpg"] };
const iceland: AlbumSource = {
  slug: "iceland",
  title: "Iceland",
  directory: join(root, "02 Iceland"),
  fileNames: ["DSC01.avif", "DSC02.avif"],
  coverFileName: "DSC02.avif",
};
const triglav: AlbumSource = { slug: "triglav", title: "Triglav", directory: join(root, "03 Triglav"), fileNames: ["t.jpg"] };

describe("chooseLinkPreviewPhoto", () => {
  it("uses the first album's cover by default", () => {
    assert.deepEqual(chooseLinkPreviewPhoto([loose, iceland, triglav], root, "", []), {
      sourcePath: join(root, "02 Iceland", "DSC02.avif"),
      albumTitle: "Iceland",
    });
  });

  it("uses the album's first photo when it has no cover", () => {
    assert.deepEqual(chooseLinkPreviewPhoto([triglav], root, "", []), {
      sourcePath: join(root, "03 Triglav", "t.jpg"),
      albumTitle: "Triglav",
    });
  });

  it("uses the photos outside albums only when there are no albums", () => {
    assert.deepEqual(chooseLinkPreviewPhoto([loose], root, "", []), { sourcePath: join(root, "a.jpg"), albumTitle: null });
  });

  it("uses the chosen photo, by its path inside the photos folder, ignoring case", () => {
    const warnings: string[] = [];
    assert.deepEqual(chooseLinkPreviewPhoto([loose, iceland, triglav], root, "02 iceland/dsc01.AVIF", warnings), {
      sourcePath: join(root, "02 Iceland", "DSC01.avif"),
      albumTitle: "Iceland",
    });
    assert.deepEqual(chooseLinkPreviewPhoto([loose, iceland], root, "./b.jpg", warnings), {
      sourcePath: join(root, "b.jpg"),
      albumTitle: null,
    });
    assert.deepEqual(warnings, []);
  });

  it("warns and falls back to the first album's cover when the chosen photo doesn't exist", () => {
    const warnings: string[] = [];
    assert.equal(chooseLinkPreviewPhoto([loose, iceland], root, "Iceland/missing.jpg", warnings)?.sourcePath, join(root, "02 Iceland", "DSC02.avif"));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Iceland\/missing\.jpg/);
  });

  it("returns nothing without photos", () => {
    assert.equal(chooseLinkPreviewPhoto([], root, "", []), undefined);
  });
});

describe("linkPreviewAlt", () => {
  it("names the photo's album, or the site for photos outside albums", () => {
    assert.equal(linkPreviewAlt("Jaka's Photos", "Iceland"), "A photo from Iceland");
    assert.equal(linkPreviewAlt("Jaka's Photos", null), "A photo from Jaka's Photos");
  });
});
