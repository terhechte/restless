import type { PreparedRequest } from "./types.ts";

export async function formatResponse(
  response: Response,
  verbose: boolean,
): Promise<string> {
  const output: string[] = [];

  if (verbose) {
    output.push(`HTTP ${response.status} ${response.statusText}`);
    response.headers.forEach((value, key) => {
      output.push(`${key}: ${value}`);
    });
    output.push("");
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("json")) {
    try {
      const data = await response.json();
      output.push(JSON.stringify(data, null, 2));
    } catch {
      const text = await response.text();
      output.push(text);
    }
  } else if (
    contentType.includes("text/") ||
    contentType.includes("application/xml") ||
    contentType.includes("application/javascript") ||
    contentType === ""
  ) {
    const text = await response.text();
    output.push(text);
  } else {
    // Binary content
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Encode in chunks to avoid call stack overflow for large responses
    let base64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      base64 += btoa(String.fromCharCode(...chunk));
    }
    output.push(`[binary data, ${buffer.byteLength} bytes, base64-encoded]`);
    output.push(base64);
  }

  return output.join("\n");
}

export function formatPreparedRequest(prepared: PreparedRequest): string {
  const lines: string[] = [];
  lines.push(`${prepared.method} ${prepared.url}`);
  for (const [key, value] of Object.entries(prepared.headers)) {
    lines.push(`${key}: ${value}`);
  }
  if (prepared.body) {
    lines.push("");
    try {
      lines.push(JSON.stringify(JSON.parse(prepared.body), null, 2));
    } catch {
      lines.push(prepared.body);
    }
  }
  return lines.join("\n");
}
