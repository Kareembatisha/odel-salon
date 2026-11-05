import { describe, expect, it } from 'vitest';
import { BARBER_IMAGE_MAX_BYTES } from '../model/barber.model';
import { validateBarberImage } from './barber-image.util';

function file(type: string, size = 10): File {
  const f = new File(['x'], 'p', { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateBarberImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateBarberImage(file(type))).toBeNull();
  });

  it('rejects other types', () => {
    expect(validateBarberImage(file('image/gif'))).toBe('type');
    expect(validateBarberImage(file('application/pdf'))).toBe('type');
    expect(validateBarberImage(file(''))).toBe('type');
  });

  it('accepts exactly 5 MB and rejects anything bigger', () => {
    expect(validateBarberImage(file('image/png', BARBER_IMAGE_MAX_BYTES))).toBeNull();
    expect(validateBarberImage(file('image/png', BARBER_IMAGE_MAX_BYTES + 1))).toBe('size');
  });
});
