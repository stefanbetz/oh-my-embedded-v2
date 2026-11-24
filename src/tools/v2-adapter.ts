import { z } from "zod"

/**
 * Compatibility layer: the upstream tools were written against the V1
 * `tool()` helper (zod schemas + a plain string result). V2 tools need a JSON
 * Schema `input` and a structured `{ content }` result.
 */
export const tool = Object.assign(
  (def: {
    description: string
    args: Record<string, z.ZodTypeAny>
    execute: (args: any) => string | Promise<string>
  }) => ({
    description: def.description,
    input: z.toJSONSchema(z.object(def.args)) as Record<string, unknown>,
    async execute(input: any) {
      return { content: await def.execute(input) }
    },
  }),
  { schema: z },
)
