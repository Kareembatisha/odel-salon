import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS } from './permissions';

describe('permission catalog', () => {
  it('builds Resource.Action strings', () => {
    expect(PERMISSIONS.Branch.Create).toBe('Branch.Create');
    expect(PERMISSIONS.User.View).toBe('User.View');
  });

  it('lists every permission exactly once', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(ALL_PERMISSIONS).toContain('Report.Export');
  });
});
