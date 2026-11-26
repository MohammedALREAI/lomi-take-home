-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('invoice', 'lease', 'market_report');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('queued', 'extracting', 'extracted', 'failed');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('approve', 'correct');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "parsedText" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'queued',
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedValue" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT,
    "evidence" TEXT,
    "evidenceStart" INTEGER,
    "evidenceEnd" INTEGER,
    "gapReason" TEXT,
    "baselineValueId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "valueId" UUID NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "correctedValue" TEXT,
    "note" TEXT,
    "carriedFromReviewId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionRun" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "rawResponse" TEXT,
    "error" TEXT,
    "usage" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentVersion_status_idx" ON "DocumentVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_number_key" ON "DocumentVersion"("documentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedValue_versionId_field_key" ON "ExtractedValue"("versionId", "field");

-- CreateIndex
CREATE INDEX "Review_valueId_seq_idx" ON "Review"("valueId", "seq");

-- CreateIndex
CREATE INDEX "ExtractionRun_versionId_idx" ON "ExtractionRun"("versionId");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedValue" ADD CONSTRAINT "ExtractedValue_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedValue" ADD CONSTRAINT "ExtractedValue_baselineValueId_fkey" FOREIGN KEY ("baselineValueId") REFERENCES "ExtractedValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "ExtractedValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_carriedFromReviewId_fkey" FOREIGN KEY ("carriedFromReviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionRun" ADD CONSTRAINT "ExtractionRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

