import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Serverless Azure SQL may be paused and reject the first connect.
    const attempts = 4;
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.$connect();
        this.logger.log('Connected to the database');
        return;
      } catch (error) {
        if (i === attempts) throw error;
        this.logger.warn(
          `Database did not respond (attempt ${i}/${attempts}). Retrying in 15 s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
