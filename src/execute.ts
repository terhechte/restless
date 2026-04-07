import { execSync } from "node:child_process";
import type {
  RestlessConfig,
  ResolvedOperation,
  ParsedArgs,
  PreparedRequest,
} from "./types.ts";

function resolveHeaderValue(value: string, configDir: string): string {
  if (!value.startsWith("sh:")) return value;

  const command = value.slice(3);
  try {
    const result = execSync(command, {
      cwd: configDir,
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return result.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to execute header command "${command}": ${message}`);
  }
}

export function resolveConfigHeaders(
  config: RestlessConfig,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  if (!config.headers) return resolved;
  for (const [key, value] of Object.entries(config.headers)) {
    resolved[key] = resolveHeaderValue(value, config.configDir);
  }
  return resolved;
}

export function prepareRequest(
  baseUrl: string,
  operation: ResolvedOperation,
  args: ParsedArgs,
  config: RestlessConfig,
): PreparedRequest {
  // Substitute path parameters
  let path = operation.path;
  for (const [key, value] of args.pathParams) {
    path = path.replaceAll(`{${key}}`, encodeURIComponent(value));
  }

  // Check for unresolved path variables
  const remaining = path.match(/\{(\w+)\}/g);
  if (remaining) {
    throw new Error(
      `Unresolved path parameters: ${remaining.join(", ")}. Use -p key=value to provide them.`,
    );
  }

  // Build URL with query params
  // Ensure baseUrl path is preserved by concatenating (new URL would replace the path)
  const fullUrl = baseUrl.replace(/\/$/, "") + path;
  const url = new URL(fullUrl);
  for (const [key, value] of args.queryParams) {
    url.searchParams.set(key, value);
  }

  // Build headers
  const headers: Record<string, string> = {};

  if (config.auth?.basic) {
    const credentials = btoa(
      `${config.auth.basic.username}:${config.auth.basic.password}`,
    );
    headers["Authorization"] = `Basic ${credentials}`;
  }

  // Apply config-level headers (static values and sh: resolved values)
  const configHeaders = resolveConfigHeaders(config);
  for (const [key, value] of Object.entries(configHeaders)) {
    headers[key] = value;
  }

  if (args.body && operation.requestBody) {
    const contentTypes = operation.requestBody.contentTypes;
    if (contentTypes.includes("application/json")) {
      headers["Content-Type"] = "application/json";
    } else if (contentTypes.length > 0) {
      headers["Content-Type"] = contentTypes[0]!;
    }
  } else if (args.body) {
    // Body provided but no requestBody in spec — default to JSON
    headers["Content-Type"] = "application/json";
  }

  // User headers override everything
  for (const [key, value] of args.headers) {
    headers[key] = value;
  }

  return {
    url: url.toString(),
    method: operation.method.toUpperCase(),
    headers,
    body: args.body ?? undefined,
  };
}

export async function executeRequest(
  prepared: PreparedRequest,
): Promise<Response> {
  return fetch(prepared.url, {
    method: prepared.method,
    headers: prepared.headers,
    body: prepared.body,
  });
}
