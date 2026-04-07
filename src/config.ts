import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { RestlessConfig } from "./types.ts";

export async function loadConfig(configPath: string): Promise<RestlessConfig> {
  const resolved = resolve(process.cwd(), configPath);

  let raw: string;
  try {
    raw = await readFile(resolved, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Config file not found: ${resolved}`);
    }
    throw new Error(`Failed to read config file: ${(err as Error).message}`);
  }

  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`Config file is not valid JSON: ${resolved}`);
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error("Config file must be a JSON object");
  }

  const obj = config as Record<string, unknown>;

  if (typeof obj.spec !== "string" || obj.spec.length === 0) {
    throw new Error("Config file missing required field 'spec'");
  }

  if (obj.server !== undefined && typeof obj.server !== "string") {
    throw new Error("Config field 'server' must be a string");
  }

  if (obj.auth !== undefined) {
    if (typeof obj.auth !== "object" || obj.auth === null) {
      throw new Error("Config field 'auth' must be an object");
    }
    const auth = obj.auth as Record<string, unknown>;
    if (auth.basic !== undefined) {
      if (typeof auth.basic !== "object" || auth.basic === null) {
        throw new Error("Config field 'auth.basic' must be an object");
      }
      const basic = auth.basic as Record<string, unknown>;
      if (typeof basic.username !== "string") {
        throw new Error("Config field 'auth.basic.username' must be a string");
      }
      if (typeof basic.password !== "string") {
        throw new Error("Config field 'auth.basic.password' must be a string");
      }
    }
  }

  // Validate headers
  if (obj.headers !== undefined) {
    if (typeof obj.headers !== "object" || obj.headers === null || Array.isArray(obj.headers)) {
      throw new Error("Config field 'headers' must be an object of key-value strings");
    }
    for (const [key, value] of Object.entries(obj.headers as Record<string, unknown>)) {
      if (typeof value !== "string") {
        throw new Error(`Config field 'headers.${key}' must be a string`);
      }
    }
  }

  // Resolve spec path if it's a local file (not a URL)
  const spec = obj.spec as string;
  const isUrl = spec.startsWith("http://") || spec.startsWith("https://");
  const resolvedSpec = isUrl ? spec : resolve(process.cwd(), spec);

  return {
    spec: resolvedSpec,
    server: obj.server as string | undefined,
    auth: obj.auth as RestlessConfig["auth"],
    headers: obj.headers as Record<string, string> | undefined,
    configDir: dirname(resolved),
  };
}
