import { describe, expect, it } from 'vitest';
import { OfferStatus } from '../model/offer.model';
import { buildOffersParams } from './offer-query';

const base = { branchId: 1, pageNumber: 1, pageSize: 12 };

describe('buildOffersParams', () => {
  it('always sends branchId and paging with the contract camelCase names', () => {
    const p = buildOffersParams({ ...base, pageNumber: 2 });
    expect(p.get('branchId')).toBe('1');
    expect(p.get('pageNumber')).toBe('2');
    expect(p.get('pageSize')).toBe('12');
  });

  it('omits search and statuses when they are not set', () => {
    const p = buildOffersParams(base);
    expect(p.has('search')).toBe(false);
    expect(p.has('statuses')).toBe(false);
  });

  it('sends the search term and drops an empty one', () => {
    expect(buildOffersParams({ ...base, search: 'weekend' }).get('search')).toBe('weekend');
    expect(buildOffersParams({ ...base, search: '' }).has('search')).toBe(false);
  });

  it('sends statuses as a REPEATED key (Ended or full = 2, 3, 4)', () => {
    const p = buildOffersParams({ ...base, statuses: [OfferStatus.Ended, OfferStatus.LimitReached, OfferStatus.Stopped] });
    expect(p.getAll('statuses')).toEqual(['2', '3', '4']);
    expect(p.toString()).toContain('statuses=2&statuses=3&statuses=4');
  });

  it('sends statuses=0 for Active — zero is a real value, not "unset"', () => {
    expect(buildOffersParams({ ...base, statuses: [OfferStatus.Active] }).getAll('statuses')).toEqual(['0']);
  });

  it('sends no statuses key for an empty list', () => {
    expect(buildOffersParams({ ...base, statuses: [] }).has('statuses')).toBe(false);
  });
});
