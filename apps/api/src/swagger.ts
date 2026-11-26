import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { reviewRequestSchema, toOpenApiSchema, uploadDocumentSchema } from "@app/core";

// Request bodies are documented from the same zod schemas that validate them.

export const reviewBodySchema = toOpenApiSchema(reviewRequestSchema);

const pdfFile = { type: "string", format: "binary", description: "The PDF (max 10 MB)." };

export const uploadDocumentBodySchema = (() => {
  const fields = toOpenApiSchema(uploadDocumentSchema) as { properties: object; required?: string[] };
  return {
    type: "object",
    properties: { ...fields.properties, file: pdfFile },
    required: [...(fields.required ?? []), "file"],
  };
})();

export const uploadVersionBodySchema = {
  type: "object",
  properties: { file: pdfFile },
  required: ["file"],
};

/** Serves interactive docs at /docs and the OpenAPI document at /docs-json. */
export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Document extraction API")
    .setDescription(
      [
        "Upload PDFs, extract values with an LLM, and review each value against the passage it was quoted from.",
        "",
        "Uploads return 202 at once with the version `queued`; poll `GET /documents/{id}` until it is `extracted` or `failed`.",
        "A correction is stored beside the model's value; `effectiveValue` is what the reviewer settled on.",
      ].join("\n"),
    )
    .setVersion("1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "docs-json" });
}
