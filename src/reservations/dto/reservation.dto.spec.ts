import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReservationDto } from './reservation.dto';

const payload = (justification: string) =>
  plainToInstance(CreateReservationDto, {
    resourceId: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
    startDateTime: '2026-11-12T15:00:00Z',
    endDateTime: '2026-11-12T16:00:00Z',
    purpose: 'INTERNAL_MEETING',
    justification,
  });

describe('CreateReservationDto', () => {
  it('rejects a detail made only of spaces', async () => {
    const errors = await validate(payload('   '));
    expect(errors.map((e) => e.property)).toContain('justification');
  });

  it('trims the detail before saving it', async () => {
    const dto = payload('  Planificación  ');
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.justification).toBe('Planificación');
  });

  it('rejects an unknown purpose', async () => {
    const dto = payload('Detalle');
    dto.purpose = 'CLIENT_EVENT';
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('purpose');
  });
});
