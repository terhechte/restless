import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import { loadSpec } from "./spec.ts";
import { prepareRequest, executeRequest } from "./execute.ts";
import { formatResponse, formatPreparedRequest } from "./format.ts";
import { printUsage, printOperationList, printOperationHelp } from "./help.ts";
import type { ParsedArgs, ResolvedOperation } from "./types.ts";

function parseCliArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    allowPositionals: true,
    options: {
      query: { type: "string", multiple: true, short: "q" },
      header: { type: "string", multiple: true, short: "H" },
      data: { type: "string", short: "d" },
      param: { type: "string", multiple: true, short: "p" },
      verbose: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  const queryParams = new Map<string, string>();
  for (const q of values.query ?? []) {
    const eqIdx = q.indexOf("=");
    if (eqIdx === -1) {
      throw new Error(
        `Invalid query parameter format: "${q}". Expected key=value`,
      );
    }
    queryParams.set(q.substring(0, eqIdx), q.substring(eqIdx + 1));
  }

  const pathParams = new Map<string, string>();
  for (const p of values.param ?? []) {
    const eqIdx = p.indexOf("=");
    if (eqIdx === -1) {
      throw new Error(
        `Invalid path parameter format: "${p}". Expected key=value`,
      );
    }
    pathParams.set(p.substring(0, eqIdx), p.substring(eqIdx + 1));
  }

  const headers = new Map<string, string>();
  for (const h of values.header ?? []) {
    const colonIdx = h.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(
        `Invalid header format: "${h}". Expected Key:value`,
      );
    }
    headers.set(
      h.substring(0, colonIdx).trim(),
      h.substring(colonIdx + 1).trim(),
    );
  }

  return {
    configPath: positionals[0] ?? null,
    operationId: positionals[1] ?? null,
    queryParams,
    headers,
    pathParams,
    body: values.data ?? null,
    verbose: values.verbose ?? false,
    dryRun: values["dry-run"] ?? false,
    help: values.help ?? false,
  };
}

async function main(): Promise<void> {
  try {
    const args = parseCliArgs(process.argv);

    if (args.help && !args.configPath) {
      printUsage();
      process.exit(0);
    }

    if (!args.configPath) {
      printUsage();
      process.exit(1);
    }

    const config = await loadConfig(args.configPath);
    const spec = await loadSpec(config);

    // No operation specified => list all operations
    if (!args.operationId) {
      printOperationList(spec);
      process.exit(0);
    }

    // Look up operation
    const operations = spec.operations.get(args.operationId);
    if (!operations || operations.length === 0) {
      console.error(`Error: Unknown operation "${args.operationId}"`);
      console.error("");

      const allOps = Array.from(spec.operations.keys());
      const query = args.operationId.toLowerCase();
      const suggestions = allOps.filter((op) =>
        op.toLowerCase().includes(query),
      );

      if (suggestions.length > 0) {
        console.error("Did you mean:");
        for (const s of suggestions) console.error(`  ${s}`);
      } else {
        console.error("Available operations:");
        for (const s of allOps.slice(0, 15)) console.error(`  ${s}`);
        if (allOps.length > 15)
          console.error(`  ... and ${allOps.length - 15} more`);
      }
      process.exit(1);
    }

    // --help with operation => show operation details
    if (args.help) {
      printOperationHelp(operations);
      process.exit(0);
    }

    // Pick the right operation when multiple methods share an operationId
    let operation: ResolvedOperation;
    if (operations.length === 1) {
      operation = operations[0]!;
    } else {
      if (args.body) {
        operation =
          operations.find((op) =>
            ["post", "put", "patch"].includes(op.method),
          ) ?? operations[0]!;
      } else {
        operation =
          operations.find((op) => op.method === "get") ?? operations[0]!;
      }
    }

    const prepared = prepareRequest(spec.baseUrl, operation, args, config);

    if (args.dryRun) {
      console.log(formatPreparedRequest(prepared));
      process.exit(0);
    }

    if (args.verbose) {
      console.error(">>> Request:");
      console.error(formatPreparedRequest(prepared));
      console.error("");
    }

    const response = await executeRequest(prepared);
    const formatted = await formatResponse(response, args.verbose);
    console.log(formatted);

    if (response.status >= 400) {
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
