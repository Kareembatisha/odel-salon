import { describe, expect, it } from 'vitest';
import { PermissionModule } from '../model/role.model';
import { enabledValues, moduleState, sameSelection, setModule, setPermission } from './permission-matrix';

const matrix = (): PermissionModule[] => [
  { module: 'User', permissions: [
    { name: 'View', value: 'User.View', isEnabled: true },
    { name: 'Create', value: 'User.Create', isEnabled: false },
  ] },
  { module: 'Role', permissions: [{ name: 'View', value: 'Role.View', isEnabled: true }] },
];

describe('permission matrix helpers', () => {
  it('lists enabled values', () => {
    expect(enabledValues(matrix())).toEqual(['User.View', 'Role.View']);
  });

  it('toggles a single permission without mutating the input', () => {
    const original = matrix();
    const next = setPermission(original, 'User.Create', true);
    expect(enabledValues(next)).toContain('User.Create');
    expect(enabledValues(original)).not.toContain('User.Create');
  });

  it('switches a whole module', () => {
    expect(enabledValues(setModule(matrix(), 'User', false))).toEqual(['Role.View']);
    expect(enabledValues(setModule(matrix(), 'User', true))).toEqual(['User.View', 'User.Create', 'Role.View']);
  });

  it('reports module state', () => {
    const [user, role] = matrix();
    expect(moduleState(user)).toBe('some');
    expect(moduleState(role)).toBe('all');
    expect(moduleState({ module: 'X', permissions: [{ name: 'a', value: 'X.a', isEnabled: false }] })).toBe('none');
  });

  it('compares selections regardless of order', () => {
    expect(sameSelection(matrix(), matrix())).toBe(true);
    expect(sameSelection(matrix(), setPermission(matrix(), 'Role.View', false))).toBe(false);
  });
});
