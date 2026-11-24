import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { Mcp, Plugin } from "@opencode/plugin"
import { createAutoDetectHook } from "./hooks/auto-detect"
import { createEspIdfContextHook } from "./hooks/esp-idf-context"
import { createTools } from "./tools/index"

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "~"
const MCP_DIR = join(HOME, ".local", "share", "oh-my-embedded")
// This machine has no `node` on PATH, but bun is available and runs the MCP bundles.
const JS_RUNTIME = join(HOME, ".bun", "bin", "bun")

interface McpEditor {
  set(name: string, config: Mcp.ServerConfig): void
}

function mcpLocal(command: string[], env?: Record<string, string>): Mcp.ServerConfig {
  return {
    type: "local",
    command,
    ...(env ? { environment: env } : {}),
    disabled: false,
    timeout: { startup: 30_000, catalog: 30_000, execution: 30_000 },
  }
}

function registerMcpServers(editor: McpEditor) {
  const espMcpDir = join(MCP_DIR, "esp-mcp")
  if (existsSync(espMcpDir)) {
    editor.set(
      "esp-mcp",
      mcpLocal([
        "uv",
        "run",
        "--directory",
        espMcpDir,
        "--python",
        "3.11",
        "python",
        "main.py",
      ]),
    )
  }

  const kicadEntry = join(MCP_DIR, "kicad-mcp-server", "dist", "index.js")
  const kicadPythonPath = existsSync(kicadEntry) ? findKicadPythonPath() : undefined
  if (kicadPythonPath) {
    editor.set("kicad-mcp", mcpLocal([JS_RUNTIME, kicadEntry], { PYTHONPATH: kicadPythonPath }))
  }

  const jlcMcpEntry = join(MCP_DIR, "jlc-cli", "packages", "mcp", "dist", "index.js")
  if (existsSync(jlcMcpEntry)) {
    editor.set("jlcpcb-mcp", mcpLocal([JS_RUNTIME, jlcMcpEntry]))
  }

  if (commandExistsSync("uvx")) {
    editor.set("spicebridge", mcpLocal(["uvx", "spicebridge"]))
  }

  if (commandExistsSync("mcp-server-gdb")) {
    editor.set("mcp-server-gdb", mcpLocal(["mcp-server-gdb"]))
  }

  if (commandExistsSync("serial-mcp-server")) {
    editor.set("serial-mcp-server", mcpLocal(["serial-mcp-server"]))
  }
}

function commandExistsSync(cmd: string): boolean {
  try {
    return spawnSync("which", [cmd], { stdio: "pipe" }).status === 0
  } catch {
    return false
  }
}

const KICAD_PYTHON_PATHS = [
  "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9/lib/python3.9/site-packages",
  "/usr/lib/python3/dist-packages",
  "/usr/local/lib/python3/dist-packages",
]

function findKicadPythonPath(): string | undefined {
  for (const p of KICAD_PYTHON_PATHS) {
    if (existsSync(join(p, "pcbnew.py"))) return p
  }

  try {
    const result = spawnSync("python3", ["-c", "import pcbnew; print(pcbnew.__file__)"], {
      encoding: "utf-8",
    })
    const stdout = result.stdout?.trim()
    if (result.status === 0 && stdout) return dirname(stdout)
  } catch {}

  return undefined
}

const OhMyEmbedded = Plugin.define({
  id: "oh-my-embedded",
  async setup(ctx) {
    const directory = ctx.location.directory

    await ctx.tool.transform((editor) => {
      for (const definition of createTools()) {
        editor.add(definition as never)
      }
    })

    await ctx.mcp.transform((editor) => {
      registerMcpServers(editor)
    })

    const autoDetect = createAutoDetectHook({ directory })
    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({
        types: ["session.created"],
        signal: controller.signal,
      })) {
        await autoDetect.onSessionCreated(event)
      }
    })()

    const espIdfContext = createEspIdfContextHook(directory)
    await ctx.session.hook("context", async (event) => {
      const parts = await espIdfContext.getContext()
      if (parts?.length) {
        event.system.push({ type: "text", text: parts.join("\n") } as never)
      }
    })

    return () => controller.abort()
  },
})

export default OhMyEmbedded
