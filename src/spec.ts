import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import type {
  RestlessConfig,
  LoadedSpec,
  ResolvedOperation,
  ResolvedParameter,
  ResolvedRequestBody,
  HttpMethod,
} from "./types.ts";

const HTTP_METHODS: HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
];

function isSwagger2(doc: OpenAPI.Document): doc is OpenAPIV2.Document {
  return "swagger" in doc;
}

function extractBaseUrl(
  doc: OpenAPI.Document,
  serverOverride?: string,
): string {
  if (serverOverride) return serverOverride.replace(/\/$/, "");

  if (isSwagger2(doc)) {
    const scheme = doc.schemes?.[0] ?? "https";
    const host = doc.host ?? "localhost";
    const basePath = doc.basePath ?? "";
    return `${scheme}://${host}${basePath}`.replace(/\/$/, "");
  }

  const v3doc = doc as OpenAPIV3.Document;
  const serverUrl = v3doc.servers?.[0]?.url ?? "http://localhost";
  return serverUrl.replace(/\/$/, "");
}

function extractTitle(doc: OpenAPI.Document): string {
  return (doc as any).info?.title ?? "Untitled API";
}

function extractVersion(doc: OpenAPI.Document): string {
  return (doc as any).info?.version ?? "unknown";
}

function extractParameters(params: unknown[]): ResolvedParameter[] {
  return (params as any[]).map((p) => ({
    name: p.name,
    in: p.in as ResolvedParameter["in"],
    required: p.required ?? (p.in === "path"),
    description: p.description,
    schema: p.schema,
  }));
}

function mergeParameters(
  pathLevel: ResolvedParameter[],
  opLevel: ResolvedParameter[],
): ResolvedParameter[] {
  const result = new Map<string, ResolvedParameter>();
  for (const p of pathLevel) result.set(`${p.in}:${p.name}`, p);
  for (const p of opLevel) result.set(`${p.in}:${p.name}`, p);
  return Array.from(result.values());
}

function extractRequestBody(
  operation: any,
): ResolvedRequestBody | undefined {
  // OpenAPI 3.x
  if (operation.requestBody && "content" in operation.requestBody) {
    return {
      required: operation.requestBody.required ?? false,
      contentTypes: Object.keys(operation.requestBody.content),
      description: operation.requestBody.description,
    };
  }
  // Swagger 2.0: body parameter
  const bodyParam = (operation.parameters ?? []).find(
    (p: any) => p.in === "body",
  );
  if (bodyParam) {
    return {
      required: bodyParam.required ?? false,
      contentTypes: operation.consumes ?? ["application/json"],
      description: bodyParam.description,
    };
  }
  return undefined;
}

function indexOperations(
  doc: OpenAPI.Document,
): Map<string, ResolvedOperation[]> {
  const operations = new Map<string, ResolvedOperation[]>();
  const paths = (doc as any).paths ?? {};

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    const item = pathItem as Record<string, any>;

    const pathLevelParams = extractParameters(item.parameters ?? []);

    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation || !operation.operationId) continue;

      const opId: string = operation.operationId;
      const operationParams = extractParameters(operation.parameters ?? []);
      const mergedParams = mergeParameters(pathLevelParams, operationParams);

      const resolved: ResolvedOperation = {
        operationId: opId,
        method,
        path,
        summary: operation.summary,
        description: operation.description,
        deprecated: operation.deprecated,
        tags: operation.tags,
        parameters: mergedParams,
        requestBody: extractRequestBody(operation),
      };

      const existing = operations.get(opId) ?? [];
      existing.push(resolved);
      operations.set(opId, existing);
    }
  }

  return operations;
}

export async function loadSpec(config: RestlessConfig): Promise<LoadedSpec> {
  const options: SwaggerParser.Options = {};

  if (config.auth?.basic) {
    const credentials = btoa(
      `${config.auth.basic.username}:${config.auth.basic.password}`,
    );
    options.resolve = {
      http: {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      },
    };
  }

  let doc: OpenAPI.Document;
  try {
    doc = await SwaggerParser.dereference(config.spec, options);
  } catch (err: unknown) {
    throw new Error(
      `Failed to load OpenAPI spec: ${(err as Error).message}`,
    );
  }

  const operations = indexOperations(doc);

  return {
    title: extractTitle(doc),
    version: extractVersion(doc),
    baseUrl: extractBaseUrl(doc, config.server),
    operations,
  };
}
