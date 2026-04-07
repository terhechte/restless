import type { LoadedSpec, ResolvedOperation } from "./types.ts";

export function printUsage(): void {
  console.log(`restless - CLI for OpenAPI specs

Usage:
  restless <config.json>                              List all operations
  restless <config.json> <operationId>                Execute an operation
  restless <config.json> <operationId> --help         Show operation details

Options:
  -q key=value     Query parameter (repeatable)
  -H Key:value     HTTP header (repeatable)
  -d <body>        Request body (JSON string)
  -p key=value     Path parameter (repeatable)
  --verbose        Show request and response details
  --dry-run        Show request without sending
  --help           Show this help

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
        const desc = p.description ? `  ${p.description}` : "";
        console.log(`    [${p.in}] ${p.name} (${req})${desc}`);
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
      console.log();
    }
  }
}
