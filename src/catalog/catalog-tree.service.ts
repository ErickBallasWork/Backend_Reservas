import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogTreeService {
  constructor(private readonly prisma: PrismaService) {}

  tree(includeInactive = false) {
    const visible = includeInactive ? {} : { isActive: true };
    return this.prisma.building.findMany({
      where: visible,
      orderBy: { name: 'asc' },
      include: {
        resources: {
          where: { ...visible, parentResourceId: null },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          include: { children: { where: visible, orderBy: { name: 'asc' } } },
        },
      },
    });
  }
}
