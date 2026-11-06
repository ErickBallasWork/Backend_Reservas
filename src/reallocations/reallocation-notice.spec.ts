import { buildReallocationNotice, type ReallocationNoticeInput } from './reallocation-notice';

const input: ReallocationNoticeInput = {
  previous: {
    roomLabel: 'Sala Pichincha (Edificio Norte)',
    startDateTime: new Date('2026-11-12T15:00:00Z'),
    endDateTime: new Date('2026-11-12T16:00:00Z'),
  },
  next: {
    roomLabel: 'Sala Amazonas (Edificio Sur)',
    startDateTime: new Date('2026-11-12T17:00:00Z'),
    endDateTime: new Date('2026-11-12T18:00:00Z'),
  },
  justification: 'Visita de cliente',
  inSeries: false,
  timeZone: 'America/Guayaquil',
};

describe('buildReallocationNotice', () => {
  it('names the previous and the new room and schedule, and the reason', () => {
    const message = buildReallocationNotice(input);

    expect(message).toContain('Antes: Sala Pichincha (Edificio Norte)');
    expect(message).toContain('Ahora: Sala Amazonas (Edificio Sur)');
    expect(message).toContain('Motivo: Visita de cliente');
  });

  it('formats both schedules in the configured time zone', () => {
    const message = buildReallocationNotice(input);

    expect(message).toMatch(/Antes: .*10:00.*11:00/);
    expect(message).toMatch(/Ahora: .*12:00.*(1:00|13:00)/);
  });

  it('tells the associate that they can cancel freely', () => {
    expect(buildReallocationNotice(input)).toContain('puedes cancelarla');
  });

  it('mentions the series only when the reservation belongs to one', () => {
    expect(buildReallocationNotice(input)).not.toContain('serie');
    expect(buildReallocationNotice({ ...input, inSeries: true })).toContain(
      'Solo cambia esta fecha de tu serie',
    );
  });

  it('shortens a long reason so the message fits the notification column', () => {
    const message = buildReallocationNotice({ ...input, justification: 'x'.repeat(1000) });

    expect(message.length).toBeLessThanOrEqual(1000);
    expect(message).toContain('…');
    expect(message).toContain('puedes cancelarla');
  });
});
