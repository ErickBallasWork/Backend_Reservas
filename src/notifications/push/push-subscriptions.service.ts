import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterPushSubscriptionDto } from './dto/push.dto';

const USER_AGENT_LIMIT = 300;

export function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

@Injectable()
export class PushSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterPushSubscriptionDto, userAgent?: string) {
    const endpointHash = hashEndpoint(dto.endpoint);
    const fields = {
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: userAgent?.slice(0, USER_AGENT_LIMIT) ?? null,
    };
    const { id } = await this.prisma.pushSubscription.upsert({
      where: { endpointHash },
      create: { ...fields, endpointHash },
      update: fields,
      select: { id: true },
    });
    return { id };
  }

  async remove(userId: string, endpoint: string) {
    const { count } = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpointHash: hashEndpoint(endpoint) },
    });
    return { removed: count };
  }
}
