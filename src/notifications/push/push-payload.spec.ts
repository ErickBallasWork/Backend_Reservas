import { buildPushPayload } from './push-payload';

describe('buildPushPayload', () => {
  it('carries the title, the body, the destination and a tag per notice', () => {
    const payload = JSON.parse(
      buildPushPayload({ id: 'n-1', title: 'Reserva confirmada', message: 'Sala A' }),
    ) as Record<string, string>;

    expect(payload).toEqual({
      title: 'Reserva confirmada',
      body: 'Sala A',
      url: '/notifications',
      tag: 'n-1',
    });
  });

  it('shortens a long message so the push stays small', () => {
    const payload = JSON.parse(
      buildPushPayload({ id: 'n-1', title: 'Reasignada', message: 'a'.repeat(900) }),
    ) as { body: string };

    expect(payload.body).toHaveLength(160);
    expect(payload.body.endsWith('…')).toBe(true);
  });
});
