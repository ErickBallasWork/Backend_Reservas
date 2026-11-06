import { reservationsOfBuilding, reservationsOfResource } from './catalog-scopes';

describe('reservationsOfResource', () => {
  it('matches only the room itself for a meeting room', () => {
    expect(reservationsOfResource({ id: 'room', type: 'MEETING_ROOM' })).toEqual({
      resourceId: 'room',
    });
  });

  it('includes the reservations of the laptops of a lab', () => {
    expect(reservationsOfResource({ id: 'lab', type: 'AI_LAB' })).toEqual({
      OR: [{ resourceId: 'lab' }, { resource: { parentResourceId: 'lab' } }],
    });
  });

  it('includes the full lab reservations that hold the laptop through slots', () => {
    expect(reservationsOfResource({ id: 'laptop', type: 'LAPTOP' })).toEqual({
      OR: [{ resourceId: 'laptop' }, { slots: { some: { resourceId: 'laptop' } } }],
    });
  });
});

describe('reservationsOfBuilding', () => {
  it('matches every reservation of the resources of the building', () => {
    expect(reservationsOfBuilding('b1')).toEqual({ resource: { buildingId: 'b1' } });
  });
});
