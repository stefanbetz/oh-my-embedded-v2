import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

interface SdkConfig {
  target?: string
  flashSize?: string
  psramEnabled?: boolean
  wifiEnabled?: boolean
  btEnabled?: boolean
  bleEnabled?: boolean
  partitionTable?: string
  freertosHz?: number
}

async function parseSdkConfig(directory: string): Promise<SdkConfig | null> {
  const sdkconfigPath = join(directory, "sdkconfig")
  if (!existsSync(sdkconfigPath)) return null

  try {
    const content = await readFile(sdkconfigPath, "utf-8")
    const config: SdkConfig = {}

    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue

      const [key, value] = trimmed.split("=", 2)
      switch (key) {
        case "CONFIG_IDF_TARGET":
          config.target = value.replace(/"/g, "")
          break
        case "CONFIG_ESPTOOLPY_FLASHSIZE":
          config.flashSize = value.replace(/"/g, "")
          break
        case "CONFIG_ESP32_SPIRAM_SUPPORT":
        case "CONFIG_SPIRAM":
          config.psramEnabled = value === "y"
          break
        case "CONFIG_ESP_WIFI_ENABLED":
          config.wifiEnabled = value === "y"
          break
        case "CONFIG_BT_ENABLED":
          config.btEnabled = value === "y"
          break
        case "CONFIG_BT_NIMBLE_ENABLED":
          config.bleEnabled = value === "y"
          break
        case "CONFIG_PARTITION_TABLE_CUSTOM_FILENAME":
          config.partitionTable = value.replace(/"/g, "")
          break
        case "CONFIG_FREERTOS_HZ":
          config.freertosHz = Number.parseInt(value, 10)
          break
      }
    }

    return config
  } catch {
    return null
  }
}

async function parsePartitionTable(directory: string, filename?: string): Promise<string | null> {
  const csvPath = join(directory, filename ?? "partitions.csv")
  if (!existsSync(csvPath)) return null

  try {
    return await readFile(csvPath, "utf-8")
  } catch {
    return null
  }
}

/**
 * Parses `sdkconfig` once and returns system-prompt parts for V2's
 * `ctx.session.hook("context", ...)`. The V1 implementation prepared these
 * parts but never injected them; V2 makes that possible.
 */
export function createEspIdfContextHook(directory: string) {
  let loaded = false
  let parts: string[] | null = null

  async function getContext(): Promise<string[] | null> {
    if (!loaded) {
      loaded = true
      const sdkConfig = await parseSdkConfig(directory)
      if (!sdkConfig) return null

      const partitions = await parsePartitionTable(directory, sdkConfig.partitionTable)
      const result: string[] = [
        "## ESP-IDF Project Context (auto-detected by oh-my-embedded)",
        "",
        `- **Target**: ${sdkConfig.target ?? "unknown"}`,
        `- **Flash**: ${sdkConfig.flashSize ?? "unknown"}`,
        `- **PSRAM**: ${sdkConfig.psramEnabled ? "Enabled" : "Disabled"}`,
        `- **WiFi**: ${sdkConfig.wifiEnabled ? "Enabled" : "Disabled"}`,
        `- **Bluetooth**: ${sdkConfig.btEnabled ? "Enabled" : "Disabled"}`,
        `- **BLE (NimBLE)**: ${sdkConfig.bleEnabled ? "Enabled" : "Disabled"}`,
        `- **FreeRTOS tick rate**: ${sdkConfig.freertosHz ?? 100}Hz`,
      ]

      if (partitions) {
        result.push("", "### Partition Table", "```", partitions.trim(), "```")
      }

      if (sdkConfig.wifiEnabled && sdkConfig.target === "esp32") {
        result.push(
          "",
          "### Important: ADC2 + WiFi Conflict",
          "ADC2 channels (GPIO 0,2,4,12-15,25-27) **cannot be used while WiFi is active**.",
          "Use ADC1 channels (GPIO 32-39) for analog reads in WiFi projects.",
        )
      }

      console.error(`[oh-my-embedded] ESP-IDF context: ${sdkConfig.target}, flash=${sdkConfig.flashSize}`)
      parts = result
    }

    return parts
  }

  return { getContext }
}
