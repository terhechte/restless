import type { LoadedSpec, ResolvedOperation } from "./types.ts";

export function printUsage(): void {
  console.log(`restless - CLI for OpenAPI specs

Usage:
  restless <config.json>                                   List all operations
  restless <config.json> <operationId>                     Execute an operation
  restless <config.json> <operationId> --help              Show operation details
  restless <config.json> --explain-endpoint <operationId>  Show operation details

Options:
  -q key=value              Query parameter (repeatable)
  -H Key:value              HTTP header (repeatable)
  -d <body>                 Request body (JSON string)
  -p key=value              Path parameter (repeatable)
  --verbose                 Show request and response details
  --dry-run                 Show request without sending
  --explain-endpoint <id>   Show operation details (alias for "<id> --help")
  --help                    Show this help

Config file format:
  {
    "spec": "https://api.example.com/openapi.json",
    "server": "https://api.example.com",
    "auth": {
      "basic": { "username": "user", "password": "pass" }
    },
    "headers": {
      "x-api-key": "my-key",
      "Authorization": "sh:./get-token.sh"
    }
  }

  Header values prefixed with "sh:" execute the command and use its stdout.

Examples:
  restless petstore.json
  restless petstore.json findPetsByStatus -q status=available
  restless petstore.json getPetById -p petId=1
  restless petstore.json addPet -d '{"name":"Rex","status":"available"}'`);
}

export function printOperationList(spec: LoadedSpec): void {
  console.log(`${spec.title} (v${spec.version})`);
  console.log(`${spec.baseUrl}\n`);

  if (spec.operations.size === 0) {
    console.log("No operations found in spec.");
    return;
  }

  // Group by tags
  const tagged = new Map<string, ResolvedOperation[]>();
  const untagged: ResolvedOperation[] = [];

  for (const ops of spec.operations.values()) {
    for (const op of ops) {
      if (op.tags && op.tags.length > 0) {
        for (const tag of op.tags) {
          const group = tagged.get(tag) ?? [];
          group.push(op);
          tagged.set(tag, group);
        }
      } else {
        untagged.push(op);
      }
    }
  }

  // Find max operationId length for alignment
  let maxIdLen = 0;
  for (const ops of spec.operations.values()) {
    for (const op of ops) {
      maxIdLen = Math.max(maxIdLen, op.operationId.length);
    }
  }

  const formatOp = (op: ResolvedOperation) => {
    const id = op.operationId.padEnd(maxIdLen);
    const method = op.method.toUpperCase().padEnd(7);
    const deprecated = op.deprecated ? " [deprecated]" : "";
    const summary = op.summary ? `  ${op.summary}` : "";
    return `  ${id}  ${method} ${op.path}${deprecated}${summary}`;
  };

  // Print tagged groups
  const sortedTags = Array.from(tagged.keys()).sort();
  for (const tag of sortedTags) {
    console.log(`${tag}:`);
    for (const op of tagged.get(tag)!) {
      console.log(formatOp(op));
    }
    console.log();
  }

  // Print untagged
  if (untagged.length > 0) {
    if (sortedTags.length > 0) {
      console.log("Other:");
    }
    for (const op of untagged) {
      console.log(formatOp(op));
    }
    console.log();
  }
}

export function printOperationHelp(operations: ResolvedOperation[]): void {
  for (const op of operations) {
    console.log(
      `${op.operationId}  ${op.method.toUpperCase()} ${op.path}`,
    );
    if (op.summary) console.log(`  ${op.summary}`);
    if (op.description) console.log(`  ${op.description}`);
    if (op.deprecated) console.log("  [deprecated]");
    console.log();

    const params = op.parameters;
    if (params.length > 0) {
      console.log("  Parameters:");
      for (const p of params) {
        const req = p.required ? "required" : "optional";
        const typeLabel = p.schema ? `: ${formatSchema(p.schema, "      ")}` : "";
        console.log(`    [${p.in}] ${p.name} (${req})${typeLabel}`);
        if (p.description) console.log(`      ${p.description}`);
      }
      console.log();
    }

    if (op.requestBody) {
      const req = op.requestBody.required ? "required" : "optional";
      const types = op.requestBody.contentTypes.join(", ");
      console.log(`  Request Body (${req}): ${types}`);
      if (op.requestBody.description) {
        console.log(`    ${op.requestBody.description}`);
      }

      const schemas = op.requestBody.schemas;
      const schemaEntries = Object.entries(schemas);
      // De-duplicate identical schemas shared across multiple content types
      const grouped = new Map<unknown, string[]>();
      for (const [ct, schema] of schemaEntries) {
        const list = grouped.get(schema) ?? [];
        list.push(ct);
        grouped.set(schema, list);
      }

      for (const [schema, cts] of grouped) {
        if (schema === undefined || schema === null) continue;
        console.log();
        console.log(`    Schema (${cts.join(", ")}):`);
        console.log(`      ${formatSchema(schema, "      ")}`);
      }
      console.log();
    }
  }
}

/**
 * Render an OpenAPI/JSON schema as a TypeScript-ish, indented block.
 * `indent` is the prefix used for continuation lines; the first line has no
 * leading indentation (the caller positions it).
 */
export function formatSchema(schema: unknown, indent: string = ""): string {
  return renderSchema(schema, indent, new WeakSet<object>());
}

function renderSchema(
  schema: unknown,
  indent: string,
  seen: WeakSet<object>,
): string {
  if (schema === null || schema === undefined) return "any";
  if (typeof schema !== "object") return "any";
  if (seen.has(schema)) return "[circular]";

  seen.add(schema);
  try {
    return renderSchemaBody(schema as Record<string, any>, indent, seen);
  } finally {
    seen.delete(schema);
  }
}

function renderSchemaBody(
  schema: Record<string, any>,
  indent: string,
  seen: WeakSet<object>,
): string {
  // Composition
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    if (Array.isArray(schema[key]) && schema[key].length > 0) {
      const sep = key === "allOf" ? " & " : " | ";
      const parts = schema[key].map((s: unknown) =>
        renderSchema(s, indent, seen),
      );
      if (parts.some((p: string) => p.includes("\n"))) {
        const joiner = `\n${indent}${sep.trim()} `;
        return parts.join(joiner);
      }
      return parts.join(sep);
    }
  }

  // Enum
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((v: unknown) => JSON.stringify(v)).join(" | ");
  }

  // const (single literal value)
  if ("const" in schema) {
    return JSON.stringify(schema.const);
  }

  const type = schema.type;
  const isObject = type === "object" || schema.properties || schema.additionalProperties;
  const isArray = type === "array" || schema.items;

  if (isObject) return renderObject(schema, indent, seen);
  if (isArray) return renderArray(schema, indent, seen);

  return renderPrimitive(schema);
}

function renderPrimitive(schema: Record<string, any>): string {
  const type = schema.type;
  let t: string;
  if (Array.isArray(type)) {
    t = type.map((x) => String(x)).join(" | ");
  } else if (typeof type === "string") {
    t = type;
    if (schema.nullable) t = `${t} | null`;
  } else {
    t = "any";
  }
  return t;
}

function renderObject(
  schema: Record<string, any>,
  indent: string,
  seen: WeakSet<object>,
): string {
  const props: Record<string, any> = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  const entries = Object.entries(props);
  const additional = schema.additionalProperties;

  if (entries.length === 0 && !additional) {
    return schema.nullable ? "object | null" : "object";
  }

  const inner = indent + "  ";
  const lines: string[] = ["{"];

  for (const [key, propSchema] of entries) {
    const opt = required.has(key) ? "" : "?";
    const rendered = renderSchema(propSchema, inner, seen);
    const meta = describeMeta(propSchema);
    const trailing = meta ? `  // ${meta}` : "";
    lines.push(`${inner}${key}${opt}: ${rendered}${trailing}`);
  }

  if (additional) {
    if (additional === true) {
      lines.push(`${inner}[key: string]: any`);
    } else {
      const rendered = renderSchema(additional, inner, seen);
      lines.push(`${inner}[key: string]: ${rendered}`);
    }
  }

  lines.push(`${indent}}${schema.nullable ? " | null" : ""}`);
  return lines.join("\n");
}

function renderArray(
  schema: Record<string, any>,
  indent: string,
  seen: WeakSet<object>,
): string {
  const items = schema.items;
  const nullable = schema.nullable ? " | null" : "";
  if (!items) return `any[]${nullable}`;

  const rendered = renderSchema(items, indent + "  ", seen);

  if (rendered.includes("\n")) {
    const inner = indent + "  ";
    return `[\n${inner}${rendered}\n${indent}]${nullable}`;
  }
  // If the inner rendering is a union, wrap in parens so `[]` binds to the whole.
  const needsParens = /\s[|&]\s/.test(rendered);
  const wrapped = needsParens ? `(${rendered})` : rendered;
  return `${wrapped}[]${nullable}`;
}

function describeMeta(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "";
  const s = schema as Record<string, any>;
  const parts: string[] = [];

  // Include format as a hint next to the type
  if (typeof s.format === "string") parts.push(s.format);
  if (s.deprecated) parts.push("deprecated");
  if (s.readOnly) parts.push("readOnly");
  if (s.writeOnly) parts.push("writeOnly");
  if (typeof s.default !== "undefined") {
    parts.push(`default: ${JSON.stringify(s.default)}`);
  }
  if (typeof s.example !== "undefined") {
    parts.push(`example: ${JSON.stringify(s.example)}`);
  }
  if (Array.isArray(s.examples) && s.examples.length > 0) {
    parts.push(
      `examples: ${s.examples.map((e: unknown) => JSON.stringify(e)).join(", ")}`,
    );
  }
  if (typeof s.minimum === "number") parts.push(`min: ${s.minimum}`);
  if (typeof s.maximum === "number") parts.push(`max: ${s.maximum}`);
  if (typeof s.exclusiveMinimum === "number") {
    parts.push(`exclusiveMin: ${s.exclusiveMinimum}`);
  }
  if (typeof s.exclusiveMaximum === "number") {
    parts.push(`exclusiveMax: ${s.exclusiveMaximum}`);
  }
  if (typeof s.multipleOf === "number") parts.push(`multipleOf: ${s.multipleOf}`);
  if (typeof s.minLength === "number") parts.push(`minLength: ${s.minLength}`);
  if (typeof s.maxLength === "number") parts.push(`maxLength: ${s.maxLength}`);
  if (typeof s.minItems === "number") parts.push(`minItems: ${s.minItems}`);
  if (typeof s.maxItems === "number") parts.push(`maxItems: ${s.maxItems}`);
  if (s.uniqueItems) parts.push("uniqueItems");
  if (typeof s.pattern === "string") parts.push(`pattern: ${s.pattern}`);

  if (typeof s.description === "string") {
    const desc = s.description.replace(/\s+/g, " ").trim();
    if (desc) parts.push(desc);
  }

  return parts.join("; ");
}
