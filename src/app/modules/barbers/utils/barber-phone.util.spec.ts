import { describe, expect, it } from 'vitest';
import { isValidEgyptianMobile, normalizeEgyptianPhone } from './barber-phone.util';

describe('normalizeEgyptianPhone', () => {
  it.each([
    ['+201001234567', '+201001234567'],
    ['01001234567', '+201001234567'],
    ['1001234567', '+201001234567'],
    ['201001234567', '+201001234567'],
    ['00201001234567', '+201001234567'],
    ['+20 100 123 4567', '+201001234567'],
    ['0100-123-4567', '+201001234567'],
    ['  01112223344 ', '+201112223344'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeEgyptianPhone(input)).toBe(expected);
  });

  it('leaves unrecognised input cleaned but unchanged so validation rejects it', () => {
    expect(normalizeEgyptianPhone('12345')).toBe('12345');
    expect(isValidEgyptianMobile(normalizeEgyptianPhone('12345'))).toBe(false);
    expect(normalizeEgyptianPhone('')).toBe('');
  });
});

describe('isValidEgyptianMobile', () => {
  it('accepts +201 followed by 9 digits', () => {
    expect(isValidEgyptianMobile('+201001234567')).toBe(true);
  });

  it.each(['01001234567', '+20100123456', '+2010012345678', '+202001234567', '+20100123456a', ''])(
    'rejects %s',
    (phone) => expect(isValidEgyptianMobile(phone)).toBe(false),
  );
});
