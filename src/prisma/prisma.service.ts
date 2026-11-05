import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // La base gratuita de Azure SQL se pausa sola: la primera conexión puede fallar mientras despierta.
    const attempts = 4;
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.$connect();
        this.logger.log('Conectado a la base de datos');
        return;
      } catch (error) {
        if (i === attempts) throw error;
        this.logger.warn(`La base no respondió (intento ${i}/${attempts}). Reintentando en 15 s...`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
