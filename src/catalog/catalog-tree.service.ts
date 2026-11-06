import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogTreeService {
  constructor(private readonly prisma: PrismaService) {}

  tree() {
    return this.prisma.building.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        resources: {
          where: { isActive: true, parentResourceId: null },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          include: { children: { where: { isActive: true }, orderBy: { name: 'asc' } } },
        },
      },
    });
  }
}
