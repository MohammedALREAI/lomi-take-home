import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient } from "@app/db";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db = createPrismaClient();

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
