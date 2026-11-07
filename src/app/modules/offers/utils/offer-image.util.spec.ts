import { describe, expect, it } from 'vitest';
import { OFFER_IMAGE_MAX_BYTES } from '../model/offer.model';
import { validateOfferImage } from './offer-image.util';

const file = (type: string, size = 10) => {
  const f = new File(['x'], 'b', { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('validateOfferImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateOfferImage(file(type))).toBeNull();
  });

  it('refuses other types', () => {
    expect(validateOfferImage(file('image/gif'))).toBe('type');
    expect(validateOfferImage(file('application/pdf'))).toBe('type');
  });

  it('accepts exactly 5 MB and refuses more', () => {
    expect(validateOfferImage(file('image/png', OFFER_IMAGE_MAX_BYTES))).toBeNull();
    expect(validateOfferImage(file('image/png', OFFER_IMAGE_MAX_BYTES + 1))).toBe('size');
  });
});
