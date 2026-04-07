export interface RestlessConfig {
  spec: string;
  server?: string;
  auth?: {
    basic?: {
      username: string;
      password: string;
    };
  };
  headers?: Record<string, string>;
  /** Directory of the config file, used to resolve sh: commands */
  configDir: string;
}

export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";

export interface ResolvedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema?: unknown;
}

export interface ResolvedRequestBody {
  required: boolean;
  contentTypes: string[];
  description?: string;
}

export interface ResolvedOperation {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags?: string[];
  parameters: ResolvedParameter[];
  requestBody?: ResolvedRequestBody;
}

export interface ParsedArgs {
  configPath: string | null;
  operationId: string | null;
  queryParams: Map<string, string>;
  headers: Map<string, string>;
  pathParams: Map<string, string>;
  body: string | null;
  verbose: boolean;
  dryRun: boolean;
  help: boolean;
}

export interface PreparedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface LoadedSpec {
  title: string;
  version: string;
  baseUrl: string;
  operations: Map<string, ResolvedOperation[]>;
}
