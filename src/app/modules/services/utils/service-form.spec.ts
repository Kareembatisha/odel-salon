import { FormBuilder } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { ServiceDetails } from '../model/service.model';
import { branchesArray, createServiceForm } from './service-form.factory';
import { ServiceFormValue, applyServiceToForm, buildServicePayload } from './service-form.mapper';

const details: ServiceDetails = {
  id: 7, nameAr: 'قص', nameEn: 'Cut', createdAt: '2026-01-01T00:00:00Z', updatedAt: null,
  branches: [
    { branchId: 1, branchNameAr: 'أ', branchNameEn: 'A', branchAllowsRegular: true, branchAllowsVip: false, branchAllowsHome: true,
      isPriced: true, durationMinutes: 30, regularPrice: 120, vipPrice: 150, isHomeAvailable: true, homePrice: 200, isActive: true },
    { branchId: 2, branchNameAr: 'ب', branchNameEn: 'B', branchAllowsRegular: true, branchAllowsVip: true, branchAllowsHome: false,
      isPriced: false, durationMinutes: null, regularPrice: null, vipPrice: null, isHomeAvailable: false, homePrice: null, isActive: false },
  ],
};

describe('service form', () => {
  const fb = new FormBuilder();

  function filled() {
    const form = createServiceForm(fb);
    applyServiceToForm(fb, form, details);
    return form;
  }

  it('loads a priced branch as text and leaves an unpriced branch blank but active', () => {
    const rows = branchesArray(filled()).getRawValue();
    expect(rows[0]).toMatchObject({ durationMinutes: '30', regularPrice: '120', homePrice: '200', isHomeAvailable: true });
    expect(rows[1]).toMatchObject({ durationMinutes: '', regularPrice: '', vipPrice: '', isActive: true });
  });

  it('is invalid while a branch has no duration or prices, valid once they are filled', () => {
    const form = filled();
    expect(form.invalid).toBe(true);
    branchesArray(form).at(1).patchValue({ durationMinutes: '45', regularPrice: '99.5', vipPrice: '130' });
    expect(form.valid).toBe(true);
  });

  it('applies the contract limits (duration steps of 5, price decimals and range)', () => {
    const row = branchesArray(filled()).at(0);
    row.patchValue({ durationMinutes: '32' });
    expect(row.get('durationMinutes')!.hasError('duration')).toBe(true);
    row.patchValue({ durationMinutes: '30', regularPrice: '99.555' });
    expect(row.get('regularPrice')!.hasError('price')).toBe(true);
    row.patchValue({ regularPrice: '100001' });
    expect(row.get('regularPrice')!.hasError('price')).toBe(true);
    row.patchValue({ regularPrice: '', vipPrice: '0' });
    expect(row.get('regularPrice')!.hasError('required')).toBe(true);
    expect(row.get('vipPrice')!.hasError('price')).toBe(true);
  });

  it('requires a home price only while home visits are on', () => {
    const row = branchesArray(filled()).at(0);
    row.patchValue({ homePrice: '' });
    row.get('homePrice')!.updateValueAndValidity();
    expect(row.get('homePrice')!.hasError('required')).toBe(true);
    row.patchValue({ isHomeAvailable: false });
    row.get('homePrice')!.updateValueAndValidity();
    expect(row.get('homePrice')!.valid).toBe(true);
  });

  it('builds the contract body: trimmed names, numbers, null home price when not at home', () => {
    const value: ServiceFormValue = {
      nameAr: '  قص ', nameEn: ' Cut  ',
      branches: [
        { branchId: 1, durationMinutes: '30', regularPrice: '120', vipPrice: '150.5', isHomeAvailable: true, homePrice: '200', isActive: true },
        { branchId: 2, durationMinutes: '45', regularPrice: '99', vipPrice: '130', isHomeAvailable: false, homePrice: '555', isActive: false },
      ],
    };
    expect(buildServicePayload(value)).toEqual({
      nameAr: 'قص', nameEn: 'Cut',
      branches: [
        { branchId: 1, durationMinutes: 30, regularPrice: 120, vipPrice: 150.5, isHomeAvailable: true, homePrice: 200, isActive: true },
        { branchId: 2, durationMinutes: 45, regularPrice: 99, vipPrice: 130, isHomeAvailable: false, homePrice: null, isActive: false },
      ],
    });
  });
});
