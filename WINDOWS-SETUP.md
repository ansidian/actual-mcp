# Windows Setup — Actual Budget MCP Server

This guide sets up the `actual-budget` MCP server on Windows for both **Claude Desktop** and **Claude Code**.

## Prerequisites

Install Node.js v22+ on Windows.

Download from: https://nodejs.org/en/download

Verify after install:
```powershell
node -v
npm -v
```

## Step 1: Unzip

Unzip the `actual-mcp` folder somewhere permanent. For example:

```
C:\Users\Andy\actual-mcp\
```

## Step 2: Install dependencies

```powershell
cd C:\Users\Andy\actual-mcp
npm install
```

Ignore any optional dependency warnings.

## Step 3: Build

```powershell
npm run build
```

## Step 4: Test it works

```powershell
node build/index.js --test-resources
```

Expected output:
```
Testing resources...
Found 2 account(s).
- <id>: Checking
- <id>: Credit Card
Resource test passed.
```

If you get connection errors, check your network can reach the Actual Budget server.

## Step 5: Configure Claude Desktop

Open the config file:

```powershell
notepad "$env:APPDATA\Claude\claude_desktop_config.json"
```

If it doesn't exist, create it. Add this (merge with existing config if you have other MCP servers):

```json
{
  "mcpServers": {
    "actual-budget": {
      "command": "node",
      "args": [
        "C:\\Users\\Andy\\actual-mcp\\build\\index.js",
        "--enable-write"
      ],
      "env": {
        "ACTUAL_SERVER_URL": "https://adaptable-turaco.pikapod.net",
        "ACTUAL_PASSWORD": "JLEKe@T&XZ4RE9",
        "ACTUAL_BUDGET_SYNC_ID": "24647c47-2aca-45d0-a483-c5d28cc86699",
        "DOTENV_CONFIG_QUIET": "true"
      }
    }
  }
}
```

Adjust the path in `args` to match where you unzipped. Use double backslashes (`\\`) in JSON paths.

Restart Claude Desktop fully (quit and reopen).

## Step 6: Configure Claude Code

Create an `.mcp.json` file in whatever directory you'll run Claude Code from (or in your home directory for global access):

```powershell
notepad C:\Users\Andy\.mcp.json
```

Same content:

```json
{
  "mcpServers": {
    "actual-budget": {
      "command": "node",
      "args": [
        "C:\\Users\\Andy\\actual-mcp\\build\\index.js",
        "--enable-write"
      ],
      "env": {
        "ACTUAL_SERVER_URL": "https://adaptable-turaco.pikapod.net",
        "ACTUAL_PASSWORD": "JLEKe@T&XZ4RE9",
        "ACTUAL_BUDGET_SYNC_ID": "24647c47-2aca-45d0-a483-c5d28cc86699",
        "DOTENV_CONFIG_QUIET": "true"
      }
    }
  }
}
```

## Updating

When the MCP server gets updated on Mac:

1. Re-zip and send the updated `actual-mcp` folder
2. Replace the folder on Windows (delete old, paste new)
3. Run `npm install && npm run build`
4. Restart Claude Desktop and/or Claude Code

## Troubleshooting

### "Error: [object Object]"
The Actual Budget server (PikaPods) updated and the local `@actual-app/api` is out of date:
```powershell
cd C:\Users\Andy\actual-mcp
npm install @actual-app/api@latest
npm run build
```
Restart Claude Desktop / Claude Code.

### Node version errors
`node -v` should return v22+. Use `nvm-windows` if you need to manage versions: https://github.com/coreybutler/nvm-windows

### Claude Desktop doesn't show the tools
- Verify the path uses double backslashes
- Verify `node build/index.js --test-resources` works from terminal
- Check Claude Desktop's MCP logs for errors

### Claude Code doesn't see the MCP
- Make sure `.mcp.json` is in the directory you're running Claude Code from, or in your home directory
- Run `claude mcp list` to verify it's detected
