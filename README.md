# FX Natives MCP

> **Disclaimer:** This project is not affiliated with, endorsed by, or associated with Cfx.re, Rockstar Games, or Take-Two Interactive.

[![npm version](https://img.shields.io/npm/v/fx-natives-mcp)](https://www.npmjs.com/package/fx-natives-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP (Model Context Protocol) server that provides AI assistants with access to CFX/FiveM/RedM native method documentation. Get accurate, up-to-date native function signatures and documentation directly in your AI-powered development workflow.

## Installation

### Using npx

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "fx-natives": {
      "command": "npx",
      "args": ["-y", "fx-natives-mcp"]
    }
  }
}
```

### Using Bun (Recommended)

```json
{
  "mcpServers": {
    "fx-natives": {
      "command": "bunx",
      "args": ["fx-natives-mcp"]
    }
  }
}
```

### Global Installation

```bash
npm install -g fx-natives-mcp
```

Then add to your MCP configuration:

```json
{
  "mcpServers": {
    "fx-natives": {
      "command": "fx-natives-mcp"
    }
  }
}
```

## Configuration by Editor

<details>
<summary>Claude Desktop</summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "fx-natives": {
      "command": "npx",
      "args": ["-y", "fx-natives-mcp"]
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

Run the following command:

```bash
claude mcp add fx-natives -- npx -y fx-natives-mcp
```

Or add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "fx-natives": {
      "command": "npx",
      "args": ["-y", "fx-natives-mcp"]
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "fx-natives": {
      "command": "npx",
      "args": ["-y", "fx-natives-mcp"]
    }
  }
}
```

</details>

<details>
<summary>VS Code (Copilot)</summary>

Add to your VS Code settings JSON:

```json
{
  "mcp": {
    "servers": {
      "fx-natives": {
        "command": "npx",
        "args": ["-y", "fx-natives-mcp"]
      }
    }
  }
}
```

</details>

## Available Tools

### `search-native`

Search for native methods using fuzzy matching.

**Parameters:**
- `query` (string) - Search query for native method
- `page` (number, optional) - Page number for paginated results (default: 1)

**Example:**
```
Search: "get player ped"
Returns: List of matching natives with their hashes
```

### `get-native-doc`

Get detailed documentation for a specific native by name or hash.

**Parameters:**
- `hashOrName` (string) - Exact native name or hash

**Example:**
```
Input: "GET_PLAYER_PED" or "0x275F255ED201B937"
Returns: Full documentation with TypeScript and Lua signatures
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Run with MCP Inspector
bun run inspect

# Build for production
bun run build
```
