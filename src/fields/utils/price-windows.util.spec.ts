import { openingHoursValid, priceWindowsError } from './price-windows.util.js';

const w = (startTime: string, endTime: string) => ({ startTime, endTime });

describe('priceWindowsError', () => {
  const day = [w('06:00', '17:00'), w('17:00', '21:00'), w('21:00', '23:00')];

  it('accepts windows that tile the opening hours, in any order', () => {
    expect(priceWindowsError(day, '06:00', '23:00')).toBeNull();
    expect(priceWindowsError([...day].reverse(), '06:00', '23:00')).toBeNull();
    expect(
      priceWindowsError([w('06:00', '23:00')], '06:00', '23:00'),
    ).toBeNull();
  });

  it('accepts Postgres HH:mm:ss values', () => {
    expect(
      priceWindowsError([w('06:00:00', '23:00:00')], '06:00:00', '23:00:00'),
    ).toBeNull();
  });

  it('detects each kind of problem', () => {
    expect(priceWindowsError([], '06:00', '23:00')).toBe('EMPTY');
    expect(priceWindowsError([w('10:00', '10:00')], '06:00', '23:00')).toBe(
      'INVALID_RANGE',
    );
    expect(
      priceWindowsError(
        [w('06:00', '18:00'), w('17:00', '23:00')],
        '06:00',
        '23:00',
      ),
    ).toBe('OVERLAP');
    expect(
      priceWindowsError(
        [w('06:00', '16:00'), w('17:00', '23:00')],
        '06:00',
        '23:00',
      ),
    ).toBe('GAP');
    expect(priceWindowsError([w('07:00', '23:00')], '06:00', '23:00')).toBe(
      'OUT_OF_RANGE',
    );
    expect(priceWindowsError([w('06:00', '22:00')], '06:00', '23:00')).toBe(
      'OUT_OF_RANGE',
    );
  });
});

describe('openingHoursValid', () => {
  it('requires 06:00 <= open < close <= 23:00', () => {
    expect(openingHoursValid('06:00', '23:00')).toBe(true);
    expect(openingHoursValid('08:00', '22:00')).toBe(true);
    expect(openingHoursValid('05:30', '22:00')).toBe(false);
    expect(openingHoursValid('08:00', '23:30')).toBe(false);
    expect(openingHoursValid('12:00', '12:00')).toBe(false);
    expect(openingHoursValid('20:00', '10:00')).toBe(false);
  });
});
