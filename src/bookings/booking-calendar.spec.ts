import {
  addDays,
  generateSlots,
  isValidDate,
  isWeekend,
  priceRange,
  sumAmounts,
  toHHmm,
  toMinutes,
} from './booking-calendar.js';

const WINDOWS = [
  { startTime: '06:00', endTime: '17:00', price: 200000 },
  { startTime: '17:00', endTime: '21:00', price: 350000 },
  { startTime: '21:00', endTime: '23:00', price: 250000 },
];

describe('time helpers', () => {
  it('converts between HH:mm and minutes', () => {
    expect(toMinutes('18:30')).toBe(1110);
    expect(toMinutes('18:30:00')).toBe(1110);
    expect(toHHmm(1110)).toBe('18:30');
    expect(toHHmm(360)).toBe('06:00');
  });
});

describe('generateSlots', () => {
  it('06:00-23:00 gives 11 slots of 90 minutes, the last 21:00-22:30', () => {
    const slots = generateSlots('06:00', '23:00', 90);
    expect(slots).toHaveLength(11);
    expect(toHHmm(slots[0].start)).toBe('06:00');
    expect(toHHmm(slots[8].start)).toBe('18:00');
    expect(toHHmm(slots.at(-1)!.start)).toBe('21:00');
    expect(toHHmm(slots.at(-1)!.end)).toBe('22:30');
  });

  it('follows custom opening hours and slot length', () => {
    expect(generateSlots('08:00', '22:00', 90)).toHaveLength(9);
    expect(
      generateSlots('08:00', '10:00', 60).map((slot) => toHHmm(slot.start)),
    ).toEqual(['08:00', '09:00']);
    expect(generateSlots('08:00', '09:00', 90)).toEqual([]);
  });
});

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isValidDate('2030-02-28')).toBe(true);
    expect(isValidDate('2030-02-30')).toBe(false);
    expect(isValidDate('2030-13-01')).toBe(false);
    expect(isValidDate('30-01-2030')).toBe(false);
  });

  it('detects weekends', () => {
    expect(isWeekend('2030-01-12')).toBe(true); // Saturday
    expect(isWeekend('2030-01-13')).toBe(true); // Sunday
    expect(isWeekend('2030-01-14')).toBe(false); // Monday
    expect(isWeekend('2030-01-11')).toBe(false); // Friday
  });

  it('adds days across month ends', () => {
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
    expect(addDays('2030-03-01', -1)).toBe('2030-02-28');
  });
});

describe('priceRange', () => {
  it('prices a slot inside one window', () => {
    const items = priceRange(WINDOWS, toMinutes('09:00'), toMinutes('10:30'));
    expect(items).toEqual([
      {
        from: '09:00',
        to: '10:30',
        unitPrice: 200000,
        minutes: 90,
        amount: 300000,
      },
    ]);
  });

  it('splits a slot that straddles two windows pro rata', () => {
    const items = priceRange(WINDOWS, toMinutes('16:30'), toMinutes('18:00'));
    expect(items).toEqual([
      {
        from: '16:30',
        to: '17:00',
        unitPrice: 200000,
        minutes: 30,
        amount: 100000,
      },
      {
        from: '17:00',
        to: '18:00',
        unitPrice: 350000,
        minutes: 60,
        amount: 350000,
      },
    ]);
    expect(sumAmounts(items)).toBe(450000);
  });

  it('adds the weekend surcharge to the hourly price', () => {
    const items = priceRange(
      WINDOWS,
      toMinutes('18:00'),
      toMinutes('19:30'),
      10,
    );
    expect(items).toEqual([
      {
        from: '18:00',
        to: '19:30',
        unitPrice: 385000,
        minutes: 90,
        amount: 577500,
      },
    ]);
  });

  it('covers several slots and three windows in one call', () => {
    const items = priceRange(WINDOWS, toMinutes('19:30'), toMinutes('22:30'));
    expect(items.map((item) => [item.from, item.to, item.minutes])).toEqual([
      ['19:30', '21:00', 90],
      ['21:00', '22:30', 90],
    ]);
  });

  it('fails loudly when the windows leave a hole', () => {
    expect(() =>
      priceRange(
        [{ startTime: '06:00', endTime: '12:00', price: 1 }],
        600,
        780,
      ),
    ).toThrow();
  });
});
