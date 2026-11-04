import { describe, expect, it } from 'vitest';
import { PaginationMeta } from '@shared/model/api_response.model';
import { EMPTY_CHAIRS_SUMMARY, readChairsSummary } from './chair-summary.util';

const meta = (additionalData: PaginationMeta['additionalData']): PaginationMeta => ({
  currentPage: 1,
  pageSize: 20,
  totalPages: 1,
  totalCount: 0,
  hasPreviousPage: false,
  hasNextPage: false,
  additionalData,
});

describe('readChairsSummary', () => {
  it('reads the three counts from meta.additionalData', () => {
    expect(readChairsSummary(meta({ regularActive: 3, vipActive: 2, inactive: 1 }))).toEqual({
      regularActive: 3,
      vipActive: 2,
      inactive: 1,
    });
  });

  it('returns zeros when meta or additionalData is missing', () => {
    expect(readChairsSummary(null)).toEqual(EMPTY_CHAIRS_SUMMARY);
    expect(readChairsSummary(undefined)).toEqual(EMPTY_CHAIRS_SUMMARY);
    expect(readChairsSummary(meta(null))).toEqual(EMPTY_CHAIRS_SUMMARY);
  });

  it('turns missing or non-numeric fields into 0', () => {
    expect(readChairsSummary(meta({ regularActive: 4, vipActive: '2', inactive: NaN }))).toEqual({
      regularActive: 4,
      vipActive: 0,
      inactive: 0,
    });
  });

  it('never hands out the shared empty constant (callers can not mutate it)', () => {
    expect(readChairsSummary(null)).not.toBe(EMPTY_CHAIRS_SUMMARY);
  });
});
