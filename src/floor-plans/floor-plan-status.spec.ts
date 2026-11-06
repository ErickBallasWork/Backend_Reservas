import {
  computeFloorStatus,
  statusResourceIds,
  type StatusInput,
  type StatusResource,
  type StatusZone,
} from './floor-plan-status';

const room: StatusResource = {
  id: 'room',
  type: 'MEETING_ROOM',
  capacity: 12,
  isActive: true,
  laptopIds: [],
};
const lab: StatusResource = {
  id: 'lab',
  type: 'AI_LAB',
  capacity: 8,
  isActive: true,
  laptopIds: ['lap-1', 'lap-2'],
};

const roomZone: StatusZone = { id: 'z-room', isReservable: true, resource: room };
const labZone: StatusZone = { id: 'z-lab', isReservable: true, resource: lab };
const decorative: StatusZone = { id: 'z-deco', isReservable: false, resource: null };

function status(overrides: Partial<StatusInput> = {}) {
  return computeFloorStatus({
    zones: [roomZone, labZone, decorative],
    busyResourceIds: new Set(),
    mineResourceIds: new Set(),
    closedResourceIds: new Set(),
    filter: {},
    ...overrides,
  });
}

function zone(result: ReturnType<typeof status>, zoneId: string) {
  return result.zones.find((item) => item.zoneId === zoneId);
}

function seatStates(result: ReturnType<typeof status>) {
  return Object.fromEntries(result.seats.map((seat) => [seat.resourceId, seat.state]));
}

describe('computeFloorStatus', () => {
  it('marks everything free when nothing is booked', () => {
    const result = status();

    expect(result.zones).toEqual([
      { zoneId: 'z-room', state: 'FREE', reason: null, totalSeats: null, freeSeats: null },
      { zoneId: 'z-lab', state: 'FREE', reason: null, totalSeats: 2, freeSeats: 2 },
      {
        zoneId: 'z-deco',
        state: 'NOT_RESERVABLE',
        reason: null,
        totalSeats: null,
        freeSeats: null,
      },
    ]);
    expect(seatStates(result)).toEqual({ 'lap-1': 'FREE', 'lap-2': 'FREE' });
  });

  it('marks a zone with an inactive resource as not reservable', () => {
    const inactive = { ...roomZone, resource: { ...room, isActive: false } };

    const result = status({ zones: [inactive] });

    expect(zone(result, 'z-room')).toMatchObject({ state: 'NOT_RESERVABLE', reason: 'INACTIVE' });
  });

  it('marks the seats of a lab that is not reservable', () => {
    const result = status({ zones: [{ ...labZone, resource: { ...lab, isActive: false } }] });

    expect(seatStates(result)).toEqual({ 'lap-1': 'NOT_RESERVABLE', 'lap-2': 'NOT_RESERVABLE' });
  });

  it('marks a room occupied when it has a busy slot', () => {
    const result = status({ busyResourceIds: new Set(['room']) });

    expect(zone(result, 'z-room')).toMatchObject({ state: 'OCCUPIED', reason: null });
  });

  it('marks a lab occupied and counts the free seats when one laptop is busy', () => {
    const result = status({ busyResourceIds: new Set(['lap-1']) });

    expect(zone(result, 'z-lab')).toMatchObject({ state: 'OCCUPIED', totalSeats: 2, freeSeats: 1 });
    expect(seatStates(result)).toEqual({ 'lap-1': 'OCCUPIED', 'lap-2': 'FREE' });
  });

  it('marks every seat occupied when the whole lab is busy', () => {
    const result = status({ busyResourceIds: new Set(['lab']) });

    expect(zone(result, 'z-lab')).toMatchObject({ state: 'OCCUPIED' });
    expect(seatStates(result)).toEqual({ 'lap-1': 'OCCUPIED', 'lap-2': 'OCCUPIED' });
  });

  it('shows my reservation over the occupation', () => {
    const result = status({
      busyResourceIds: new Set(['room']),
      mineResourceIds: new Set(['room']),
    });

    expect(zone(result, 'z-room')).toMatchObject({ state: 'MINE' });
  });

  it('shows my reservation over the filters', () => {
    const result = status({ mineResourceIds: new Set(['room']), filter: { type: 'AI_LAB' } });

    expect(zone(result, 'z-room')).toMatchObject({ state: 'MINE', reason: null });
  });

  it('marks the lab and every seat mine for my full lab reservation', () => {
    const result = status({
      busyResourceIds: new Set(['lab', 'lap-1', 'lap-2']),
      mineResourceIds: new Set(['lab']),
    });

    expect(zone(result, 'z-lab')).toMatchObject({ state: 'MINE' });
    expect(seatStates(result)).toEqual({ 'lap-1': 'MINE', 'lap-2': 'MINE' });
  });

  it('marks only my laptop mine and the lab occupied for a laptop reservation', () => {
    const result = status({
      busyResourceIds: new Set(['lap-2']),
      mineResourceIds: new Set(['lap-2']),
    });

    expect(zone(result, 'z-lab')).toMatchObject({ state: 'OCCUPIED', freeSeats: 1 });
    expect(seatStates(result)).toEqual({ 'lap-1': 'FREE', 'lap-2': 'MINE' });
  });

  it('puts the zones of another type out of the filter', () => {
    const result = status({ filter: { type: 'MEETING_ROOM' }, busyResourceIds: new Set(['lab']) });

    expect(zone(result, 'z-room')).toMatchObject({ state: 'FREE' });
    expect(zone(result, 'z-lab')).toMatchObject({ state: 'OUT_OF_FILTER', reason: 'TYPE' });
    expect(seatStates(result)).toEqual({ 'lap-1': 'OUT_OF_FILTER', 'lap-2': 'OUT_OF_FILTER' });
  });

  it('keeps my laptop mine when its lab is out of the filter', () => {
    const result = status({
      filter: { type: 'MEETING_ROOM' },
      mineResourceIds: new Set(['lap-1']),
    });

    expect(seatStates(result)).toEqual({ 'lap-1': 'MINE', 'lap-2': 'OUT_OF_FILTER' });
  });

  it('puts the zones below the minimum capacity out of the filter', () => {
    const result = status({ filter: { minCapacity: 10 } });

    expect(zone(result, 'z-room')).toMatchObject({ state: 'FREE' });
    expect(zone(result, 'z-lab')).toMatchObject({ state: 'OUT_OF_FILTER', reason: 'CAPACITY' });
  });

  it('puts a closed resource out of the filter before checking occupation', () => {
    const result = status({
      closedResourceIds: new Set(['room']),
      busyResourceIds: new Set(['room']),
    });

    expect(zone(result, 'z-room')).toMatchObject({ state: 'OUT_OF_FILTER', reason: 'CLOSED' });
  });

  it('reports the type reason before the capacity and the closure', () => {
    const result = status({
      filter: { type: 'MEETING_ROOM', minCapacity: 20 },
      closedResourceIds: new Set(['lab']),
    });

    expect(zone(result, 'z-lab')).toMatchObject({ reason: 'TYPE' });
    expect(zone(result, 'z-room')).toMatchObject({ reason: 'CAPACITY' });
  });
});

describe('statusResourceIds', () => {
  it('collects the linked resources and the laptops of the labs', () => {
    expect(statusResourceIds([roomZone, labZone, decorative])).toEqual([
      'room',
      'lab',
      'lap-1',
      'lap-2',
    ]);
  });
});
