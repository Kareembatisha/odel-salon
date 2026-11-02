import { describe, expect, it } from 'vitest';
import { buildProfileFormData } from './profile-form-data';

const base = { fullName: ' Omar Khaled ', email: 'omar@odel.com', countryCode: '+20', phoneNumber: '1029005195', removeImage: false };

describe('buildProfileFormData', () => {
  it('uses the PascalCase field names the API binds and trims text', () => {
    const body = buildProfileFormData(base);
    expect(body.get('FullName')).toBe('Omar Khaled');
    expect(body.get('Email')).toBe('omar@odel.com');
    expect(body.get('CountryCode')).toBe('+20');
    expect(body.get('PhoneNumber')).toBe('1029005195');
    expect(body.get('RemoveImage')).toBe('false');
    expect(body.has('Image')).toBe(false);
  });

  it('appends the image only when a file is chosen', () => {
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    const body = buildProfileFormData({ ...base, image: file });
    expect((body.get('Image') as File).name).toBe('me.png');
  });

  it('sends RemoveImage=true when the photo is removed', () => {
    expect(buildProfileFormData({ ...base, removeImage: true }).get('RemoveImage')).toBe('true');
  });
});
