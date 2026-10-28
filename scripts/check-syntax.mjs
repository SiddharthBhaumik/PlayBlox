import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "worker/src", "scripts"];
const files = [];
async function walk(path) {
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (extname(entry.name) === ".js" || extname(entry.name) === ".mjs") files.push(full);
  }
}
for (const root of roots) await walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\nSyntax check failed: ${file}\n${result.stderr || result.stdout}`);
  }
}
if (failed) process.exit(1);
console.log(`JavaScript syntax check passed for ${files.length} files.`);
