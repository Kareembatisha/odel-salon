import { describe, expect, it } from 'vitest';
import { ChairType } from '../model/chair.model';
import { buildChairsParams } from './chair-query';

describe('buildChairsParams', () => {
  it('always sends paging with the contract camelCase names', () => {
    const p = buildChairsParams({ pageNumber: 2, pageSize: 20 });
    expect(p.get('pageNumber')).toBe('2');
    expect(p.get('pageSize')).toBe('20');
    expect(p.has('PageNumber')).toBe(false);
  });

  it('omits every filter that is not set', () => {
    const p = buildChairsParams({ pageNumber: 1, pageSize: 20 });
    ['branchId', 'type', 'isActive', 'search'].forEach((k) => expect(p.has(k)).toBe(false));
  });

  it('sends branchId when set', () => {
    expect(buildChairsParams({ pageNumber: 1, pageSize: 20, branchId: 3 }).get('branchId')).toBe('3');
  });

  it('sends type=0 (Regular) — 0 is a real filter, not "unset"', () => {
    const p = buildChairsParams({ pageNumber: 1, pageSize: 20, type: ChairType.Regular });
    expect(p.get('type')).toBe('0');
  });

  it('sends type=1 (Vip)', () => {
    expect(buildChairsParams({ pageNumber: 1, pageSize: 20, type: ChairType.Vip }).get('type')).toBe('1');
  });

  it('sends isActive=false for the "inactive" filter and true for "active"', () => {
    expect(buildChairsParams({ pageNumber: 1, pageSize: 20, isActive: false }).get('isActive')).toBe('false');
    expect(buildChairsParams({ pageNumber: 1, pageSize: 20, isActive: true }).get('isActive')).toBe('true');
  });

  it('sends search when set and omits it when empty', () => {
    expect(buildChairsParams({ pageNumber: 1, pageSize: 20, search: 'V' }).get('search')).toBe('V');
    expect(buildChairsParams({ pageNumber: 1, pageSize: 20, search: '' }).has('search')).toBe(false);
  });

  it('combines all filters', () => {
    const p = buildChairsParams({ pageNumber: 1, pageSize: 20, branchId: 3, type: 1, isActive: true, search: 'V' });
    expect(p.toString()).toBe('pageNumber=1&pageSize=20&branchId=3&type=1&isActive=true&search=V');
  });
});
