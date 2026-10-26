import { localParts } from './clock.service.js';

describe('localParts', () => {
  it('converts an instant to the date and minutes of the given timezone', () => {
    const instant = new Date('2030-01-10T20:30:00Z'); // 03:30 next day in Vietnam (UTC+7)
    expect(localParts(instant, 'Asia/Ho_Chi_Minh')).toEqual({
      date: '2030-01-11',
      minutes: 3 * 60 + 30,
    });
    expect(localParts(instant, 'UTC')).toEqual({
      date: '2030-01-10',
      minutes: 20 * 60 + 30,
    });
  });

  it('treats midnight as 00:00, not 24:00', () => {
    expect(
      localParts(new Date('2030-01-10T17:00:00Z'), 'Asia/Ho_Chi_Minh'),
    ).toEqual({ date: '2030-01-11', minutes: 0 });
  });
});
