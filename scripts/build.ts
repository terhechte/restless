import { readFile, writeFile, chmod } from "node:fs/promises";

const result = await Bun.build({
  entrypoints: ["src/cli.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Prepend shebang to the output
const outPath = "dist/cli.js";
const content = await readFile(outPath, "utf-8");
await writeFile(outPath, `#!/usr/bin/env node\n${content}`);
await chmod(outPath, 0o755);

console.log("Build complete: dist/cli.js");
