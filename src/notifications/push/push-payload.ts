const BODY_LIMIT = 160;

export interface PushPayloadInput {
  id: string;
  title: string;
  message: string;
}

export function buildPushPayload({ id, title, message }: PushPayloadInput): string {
  const body = message.length <= BODY_LIMIT ? message : `${message.slice(0, BODY_LIMIT - 1)}…`;
  return JSON.stringify({ title, body, url: '/notifications', tag: id });
}
