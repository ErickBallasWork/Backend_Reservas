import { Injectable } from '@nestjs/common';
import webpush from 'web-push';
import { AppConfigService } from '../../config/app-config.service';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = 'delivered' | 'gone';

const GONE_STATUS_CODES = [404, 410];
const TTL_SECONDS = 60 * 60;

function statusCodeOf(error: unknown): number | undefined {
  return error instanceof webpush.WebPushError ? error.statusCode : undefined;
}

@Injectable()
export class PushSender {
  constructor(private readonly appConfig: AppConfigService) {}

  async send(target: PushTarget, payload: string): Promise<PushOutcome> {
    const push = this.appConfig.push;
    if (!push) throw new Error('Web push is not configured');
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        {
          vapidDetails: {
            subject: push.subject,
            publicKey: push.publicKey,
            privateKey: push.privateKey,
          },
          TTL: TTL_SECONDS,
          urgency: 'high',
        },
      );
      return 'delivered';
    } catch (error) {
      const statusCode = statusCodeOf(error);
      if (statusCode !== undefined && GONE_STATUS_CODES.includes(statusCode)) return 'gone';
      throw error;
    }
  }
}
