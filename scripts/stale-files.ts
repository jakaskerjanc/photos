import { readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export async function removeStaleFiles(rootDirectory: string, expectedPaths: Set<string>) {
  await pruneDirectory(rootDirectory, "", expectedPaths);
}

// Returns true when the directory is empty after pruning.
async function pruneDirectory(directory: string, relativeDirectory: string, expectedPaths: Set<string>) {
  const entries = await readdir(directory, { withFileTypes: true });
  let remainingEntries = entries.length;

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (await pruneDirectory(path, relativePath, expectedPaths)) {
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
