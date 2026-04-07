# RESTLESS

<div align="center">
  <img src="media/logo.png" width="50%">
</div>

A minimal CLI tool for consuming OpenAPI specs. Browse available operations, inspect parameters, and execute API calls directly from your terminal.

## Install

```bash
bun install
```

## Usage

```bash
# List all operations in an API
bun run src/cli.ts <config.json>

# Execute an operation
bun run src/cli.ts <config.json> <operationId>

# Show details for an operation (parameters, request body, etc.)
bun run src/cli.ts <config.json> <operationId> --help

# Pass query params, headers, path params, or a request body
bun run src/cli.ts <config.json> <operationId> -q key=value -H Key:value -p id=123 -d '{"name":"Rex"}'

# Preview the request without sending it
bun run src/cli.ts <config.json> <operationId> --dry-run

# Show full request and response details
bun run src/cli.ts <config.json> <operationId> --verbose
```

## Example

There's an example config and OpenAPI spec in the `example/` folder:

```bash
# List all available operations
bun run dev example/api.json

# Inspect an operation
bun run dev example/api.json createUser --help

# Dry-run an operation
bun run dev example/api.json findPetsByStatus -q status=available --dry-run
```

## Config File

Each config file defines a single API:

```json
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
```

| Field        | Required | Description                                                        |
| ------------ | -------- | ------------------------------------------------------------------ |
| `spec`       | Yes      | URL or local file path to an OpenAPI spec (JSON or YAML)           |
| `server`     | No       | Override the server URL from the spec                              |
| `auth.basic` | No       | Basic auth credentials (used for both spec fetching and API calls) |
| `headers`    | No       | Headers to include in every request                                |

Header values prefixed with `sh:` execute the command and use its stdout as the value. Commands run with the config file's directory as the working directory.

## Build

Build a standalone Node.js-compatible binary:

```bash
bun run build
```

This produces `dist/cli.js` which works with `node`, `npx`, `bunx`, and `deno run npm:restless`.
