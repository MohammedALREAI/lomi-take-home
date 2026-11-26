import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { DocumentsController } from "./documents.controller.js";
import { ErrorsFilter } from "./errors.filter.js";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "./prisma.service.js";
import { QueueService } from "./queue.service.js";
import { ValuesController } from "./values.controller.js";

@Module({
  controllers: [HealthController, DocumentsController, ValuesController],
  providers: [PrismaService, QueueService, { provide: APP_FILTER, useClass: ErrorsFilter }],
})
export class AppModule {}
