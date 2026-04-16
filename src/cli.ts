import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import { loadSpec } from "./spec.ts";
import { prepareRequest, executeRequest, getProxy } from "./execute.ts";
import { formatResponse, formatPreparedRequest } from "./format.ts";
import { printUsage, printOperationList, printOperationHelp } from "./help.ts";
import type { ParsedArgs, ResolvedOperation } from "./types.ts";

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const parts: string[] = [error.message];
  let current: unknown = error.cause;
  while (current) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(": ");
}

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
      "explain-endpoint": { type: "string" },
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
    explainEndpoint: values["explain-endpoint"] ?? null,
  };
}

async function main(): Promise<void> {
  try {
    const args = parseCliArgs(process.argv);

    // `--explain-endpoint <name>` is sugar for `<name> --help`, useful for
    // permission patterns like `bunx restless config.json --explain-endpoint *`.
    if (args.explainEndpoint) {
      args.operationId = args.explainEndpoint;
      args.help = true;
    }

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

    const proxy = getProxy(prepared.url);

    if (args.dryRun) {
      console.log(formatPreparedRequest(prepared));
      if (proxy) console.log(`Proxy: ${proxy}`);
      process.exit(0);
    }

    if (args.verbose) {
      console.error(">>> Request:");
      console.error(formatPreparedRequest(prepared));
      if (proxy) console.error(`Proxy: ${proxy}`);
      console.error("");
    }

    const response = await executeRequest(prepared);
    const failed = response.status >= 400;

    // On failure with --verbose, show full response details even if
    // they wouldn't normally be printed
    const showDetails = args.verbose || failed;
    const formatted = await formatResponse(response, showDetails);

    if (failed && !args.verbose) {
      // Print request details to stderr so user sees what was sent
      console.error(`>>> Request:`);
      console.error(formatPreparedRequest(prepared));
      console.error("");
      console.error(`<<< Response:`);
    }

    console.log(formatted);

    if (failed) {
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = formatError(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
