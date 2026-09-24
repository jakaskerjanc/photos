import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { removeStaleFiles } from "./stale-files";

describe("removeStaleFiles", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "stale-files-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function touch(relativePath: string) {
    const path = join(root, ...relativePath.split("/"));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "");
  }

  async function listTree() {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .map((entry) => {
        const path = relative(root, join(entry.parentPath, entry.name)).split(sep).join("/");
        return entry.isDirectory() ? `${path}/` : path;
      })
      .sort();
  }

  it("keeps expected files at the top level and in album folders", async () => {
    await touch("loose.avif");
    await touch("julian-alps/a.avif");

    await removeStaleFiles(root, new Set(["loose.avif", "julian-alps/a.avif"]));

    assert.deepEqual(await listTree(), ["julian-alps/", "julian-alps/a.avif", "loose.avif"]);
  });

  it("removes top-level files after photos move into an album", async () => {
    await touch("DSC01120.avif");
    await touch("iceland/DSC01120.avif");

    await removeStaleFiles(root, new Set(["iceland/DSC01120.avif"]));

    assert.deepEqual(await listTree(), ["iceland/", "iceland/DSC01120.avif"]);
  });

  it("removes a renamed album's old folder entirely", async () => {
    await touch("test-alps/a.avif");
    await touch("test-alps/b.avif");
    await touch("test-dolomites/a.avif");

    await removeStaleFiles(root, new Set(["test-dolomites/a.avif"]));

    assert.deepEqual(await listTree(), ["test-dolomites/", "test-dolomites/a.avif"]);
  });

  it("does not treat a same-named file in another album as expected", async () => {
    await touch("iceland/DSC01120.avif");
    await touch("alps/DSC01120.avif");

    await removeStaleFiles(root, new Set(["alps/DSC01120.avif"]));

    assert.deepEqual(await listTree(), ["alps/", "alps/DSC01120.avif"]);
  });

  it("empties but keeps the root when nothing is expected", async () => {
    await touch("a.avif");
    await touch("album/b.avif");

    await removeStaleFiles(root, new Set());

    assert.deepEqual(await listTree(), []);
    assert.deepEqual(await readdir(root), []);
  });
});
