import { readdir, rmdir, unlink } from "node:fs/promises";
import { join, posix } from "node:path";

export async function removeStaleFiles(rootDirectory: string, expectedPaths: Set<string>) {
  await pruneDirectoryAndCheckEmpty(rootDirectory, "", expectedPaths);
}

async function pruneDirectoryAndCheckEmpty(directory: string, relativeDirectory: string, expectedPaths: Set<string>) {
  const entries = await readdir(directory, { withFileTypes: true });
  let remainingEntries = entries.length;

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = posix.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      if (await pruneDirectoryAndCheckEmpty(path, relativePath, expectedPaths)) {
        await rmdir(path);
        remainingEntries--;
      }
    } else if (entry.isFile() && !expectedPaths.has(relativePath)) {
      await unlink(path);
      remainingEntries--;
    }
  }

  return remainingEntries === 0;
}
