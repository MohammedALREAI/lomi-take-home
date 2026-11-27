import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { uploadDocumentSchema } from "@app/core";
import {
  addVersion,
  createDocument,
  getDocument,
  getDocumentPdf,
  getProgress,
  listDocuments,
  retryLatest,
} from "@app/db";
import {
  MAX_PDF_BYTES,
  parseVersion,
  requireBody,
  requirePdf,
  type UploadedPdf,
} from "./http.js";
import { PrismaService } from "./prisma.service.js";
import { QueueService } from "./queue.service.js";
import {
  uploadDocumentBodySchema,
  uploadVersionBodySchema,
} from "./swagger.js";

const pdfUpload = FileInterceptor("file", {
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});
const documentId = ApiParam({
  name: "id",
  description: "Document id, e.g. doc-invoice-001",
});

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "List documents with their current version, status and review progress",
  })
  list() {
    return listDocuments(this.prisma.db);
  }

  /** Stores the PDF and returns at once; extraction happens in the worker. */
  @Post()
  @HttpCode(202)
  @UseInterceptors(pdfUpload)
  @ApiOperation({
    summary: "Upload a PDF as a new document",
    description:
      "Responds at once with version 1 `queued`. Extraction runs in the background.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: uploadDocumentBodySchema })
  @ApiResponse({
    status: 202,
    description: "Stored and queued for extraction.",
  })
  @ApiResponse({
    status: 400,
    description: "Unknown type, or the file is missing or not a PDF.",
  })
  async upload(
    @Body() body: unknown,
    @UploadedFile() file: UploadedPdf | undefined,
  ) {
    const { type, title } = requireBody(uploadDocumentSchema, body);
    const upload = requirePdf(file);
    const created = await createDocument(this.prisma.db, {
      type,
      title: title || upload.fileName.replace(/\.pdf$/i, ""),
      ...upload,
    });
    this.queue.requestExtraction(created.versionId);
    return { ...created, status: "queued" };
  }

  /** A new version waits in the queue until earlier versions of the document finish. */
  @Post(":id/versions")
  @HttpCode(202)
  @UseInterceptors(pdfUpload)
  @documentId
  @ApiOperation({
    summary: "Upload a new version of a document",
    description:
      "The new version is queued behind any version still extracting. Reviews whose evidence is unchanged carry over when it is extracted.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: uploadVersionBodySchema })
  @ApiResponse({
    status: 202,
    description: "Stored and queued for extraction.",
  })
  @ApiResponse({ status: 404, description: "No such document." })
  async uploadVersion(
    @Param("id") id: string,
    @UploadedFile() file: UploadedPdf | undefined,
  ) {
    const created = await addVersion(this.prisma.db, id, requirePdf(file));
    this.queue.requestExtraction(created.versionId);
    return { ...created, status: "queued" };
  }

  @Get(":id")
  @documentId
  @ApiQuery({
    name: "version",
    required: false,
    description: "Version number to show; defaults to the current one.",
  })
  @ApiOperation({
    summary: "A document's versions, status and extracted values",
    description:
      "Each value has `value` (null for a gap), `gap.reason`, the verbatim `evidence`, its review `state` (pending, approved, corrected, carried_over), the `effectiveValue`, and the previous version's value and review as `baseline`.",
  })
  @ApiResponse({ status: 404, description: "No such document or version." })
  get(@Param("id") id: string, @Query("version") version?: string) {
    return getDocument(this.prisma.db, id, parseVersion(version));
  }

  @Get(":id/pdf")
  @documentId
  @ApiQuery({
    name: "version",
    required: false,
    description: "Version number to stream; defaults to the current one.",
  })
  @ApiQuery({
    name: "download",
    required: false,
    description: "Set to 1 to force file download instead of inline preview.",
  })
  @ApiProduces("application/pdf")
  @ApiOperation({
    summary: "Stream or download a document version's original PDF",
  })
  @ApiResponse({ status: 200, description: "PDF bytes." })
  @ApiResponse({ status: 404, description: "No such document or version." })
  async pdf(
    @Param("id") id: string,
    @Query("version") version?: string,
    @Query("download") download?: string,
  ) {
    const row = await getDocumentPdf(this.prisma.db, id, parseVersion(version));
    const safeName = row.fileName.replace(/["\\\r\n]/g, "_");
    const mode = download === "1" ? "attachment" : "inline";
    return new StreamableFile(row.pdf, {
      type: "application/pdf",
      disposition: `${mode}; filename="${safeName}"`,
      length: row.pdf.byteLength,
    });
  }

  @Get(":id/progress")
  @documentId
  @ApiOperation({
    summary: "Counts of pending, approved, corrected and carried-over values",
    description:
      "Counts the current version, or the latest extracted one while the current version is still in progress.",
  })
  progress(@Param("id") id: string) {
    return getProgress(this.prisma.db, id);
  }

  /** Requeues the latest version if it failed; otherwise reports its current state. */
  @Post(":id/retry")
  @HttpCode(200)
  @documentId
  @ApiOperation({
    summary: "Retry the latest version if its extraction failed",
  })
  async retry(@Param("id") id: string) {
    const result = await retryLatest(this.prisma.db, id);
    if (result.requeued) this.queue.requestExtraction(result.versionId);
    return result;
  }
}
