import { BadRequestException } from "@nestjs/common";
import { parseRequest, type RequestSchema } from "@app/core";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** The parts of a multer upload this API uses. */
export interface UploadedPdf {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export function requireBody<T>(schema: RequestSchema<T>, body: unknown): T {
  const parsed = parseRequest(schema, body ?? {});
  if (!parsed.ok) throw new BadRequestException(parsed.error);
  return parsed.data;
}

/** Checks that an upload is present and is a PDF, and returns bytes Prisma can store. */
export function requirePdf(file: UploadedPdf | undefined): { fileName: string; pdf: Uint8Array<ArrayBuffer> } {
  if (!file || file.size === 0) throw new BadRequestException('Attach a PDF in the "file" field.');
  if (file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new BadRequestException(`${file.originalname} is not a PDF.`);
  }
  return { fileName: file.originalname, pdf: new Uint8Array(file.buffer) };
}

export function parseVersion(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new BadRequestException("version must be a positive integer.");
  return n;
}
