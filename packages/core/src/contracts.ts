import { z } from "zod";
import { DOCUMENT_TYPES } from "./fields.js";

// Request bodies shared by the API (validation) and the web app (forms).

export const uploadDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().max(200).optional(),
});
export type UploadDocumentRequest = z.infer<typeof uploadDocumentSchema>;

export const reviewRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("correct"),
    correctedValue: z.string().trim().min(1, "A correction needs a value.").max(500),
    note: z.string().trim().max(2000).optional(),
  }),
]);
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export type RequestSchema<T> = z.ZodType<T>;

/** OpenAPI form of a request schema, so the API docs come from the same definition as validation. */
export function toOpenApiSchema(schema: z.ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" });
  delete json.$schema;
  return json;
}

/** Parses a request body, returning a readable error instead of throwing. */
export function parseRequest<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  const parsed = schema.safeParse(input);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: z.prettifyError(parsed.error) };
}
