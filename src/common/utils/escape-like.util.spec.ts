import { escapeLike } from './escape-like.util.js';

describe('escapeLike', () => {
  it('escapes wildcard characters', () => {
    expect(escapeLike('100%_sale\\')).toBe('100\\%\\_sale\\\\');
  });
  it('keeps normal text', () => {
    expect(escapeLike('Sân A1')).toBe('Sân A1');
  });
});
