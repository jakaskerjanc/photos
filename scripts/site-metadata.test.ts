import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headTags } from "./site-metadata";

const image = {
  path: "photos/derivatives/link-preview.jpg",
  width: 1200,
  height: 630,
  alt: "A photo from Iceland",
  version: "abc123",
};

describe("headTags", () => {
  it("writes the title, description, address and preview image", () => {
    assert.deepEqual(headTags({ title: "Jaka's Photos", description: "Photos.", url: "https://photos.example/", image }), [
      "<title>Jaka's Photos</title>",
      '<meta name="description" content="Photos." />',
      '<meta property="og:type" content="website" />',
      `<meta property="og:title" content="Jaka's Photos" />`,
      '<meta property="og:description" content="Photos." />',
      '<meta property="og:url" content="https://photos.example/" />',
      '<meta property="og:image" content="https://photos.example/photos/derivatives/link-preview.jpg?v=abc123" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta property="og:image:alt" content="A photo from Iceland" />',
      '<meta name="twitter:card" content="summary_large_image" />',
    ]);
  });

  it("resolves the image against a site under a path, with or without a trailing slash", () => {
    for (const url of ["https://user.github.io/photos/", "https://user.github.io/photos"]) {
      const tags = headTags({ title: "T", description: "D", url, image });
      assert.ok(tags.includes('<meta property="og:url" content="https://user.github.io/photos/" />'));
      assert.ok(
        tags.includes('<meta property="og:image" content="https://user.github.io/photos/photos/derivatives/link-preview.jpg?v=abc123" />'),
      );
    }
  });

  it("leaves out the address and image without a url", () => {
    const tags = headTags({ title: "T", description: "D", url: "", image });
    assert.equal(tags.length, 5);
    assert.ok(!tags.some((tag) => /og:url|og:image|twitter:card/.test(tag)));
  });

  it("leaves out the image tags when there is no image", () => {
    const tags = headTags({ title: "T", description: "D", url: "https://photos.example/", image: null });
    assert.ok(tags.some((tag) => tag.includes("og:url")));
    assert.ok(!tags.some((tag) => /og:image|twitter:card/.test(tag)));
  });

  it("escapes text for HTML attributes", () => {
    const [title, description] = headTags({ title: "A & B", description: 'Say "hi" <now>', url: "", image: null });
    assert.equal(title, "<title>A &amp; B</title>");
    assert.equal(description, '<meta name="description" content="Say &quot;hi&quot; &lt;now&gt;" />');
  });
});
