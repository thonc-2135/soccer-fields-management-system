import { hasEnoughCharacterClasses } from './is-strong-password.validator.js';

describe('hasEnoughCharacterClasses', () => {
  it.each(['abcDEF12', 'abcdef1!', 'ABCDEF1!', 'abcDEF!!'])(
    'accepts %s (3 classes)',
    (v) => {
      expect(hasEnoughCharacterClasses(v)).toBe(true);
    },
  );

  it.each([
    'abcdefgh',
    'ABCDEFGH',
    '12345678',
    'abcdEFGH',
    'abcd1234',
    'abcd!!!!',
  ])('rejects %s (fewer than 3 classes)', (v) => {
    expect(hasEnoughCharacterClasses(v)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(hasEnoughCharacterClasses(undefined)).toBe(false);
  });
});
