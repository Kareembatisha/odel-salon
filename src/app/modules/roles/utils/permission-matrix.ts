import { PermissionModule } from '../model/role.model';

/** All enabled permission values, in matrix order — the body for Update Role Permissions. */
export function enabledValues(modules: PermissionModule[]): string[] {
  return modules.flatMap((m) => m.permissions.filter((p) => p.isEnabled).map((p) => p.value));
}

/** Returns a copy with one permission switched on/off. */
export function setPermission(modules: PermissionModule[], value: string, isEnabled: boolean): PermissionModule[] {
  return modules.map((m) => ({
    ...m,
    permissions: m.permissions.map((p) => (p.value === value ? { ...p, isEnabled } : p)),
  }));
}

/** Returns a copy with every permission of a module switched on/off. */
export function setModule(modules: PermissionModule[], module: string, isEnabled: boolean): PermissionModule[] {
  return modules.map((m) =>
    m.module === module ? { ...m, permissions: m.permissions.map((p) => ({ ...p, isEnabled })) } : m,
  );
}

export type ModuleState = 'none' | 'some' | 'all';

export function moduleState(m: PermissionModule): ModuleState {
  const on = m.permissions.filter((p) => p.isEnabled).length;
  return on === 0 ? 'none' : on === m.permissions.length ? 'all' : 'some';
}

/** True when the two matrices enable exactly the same permissions. */
export function sameSelection(a: PermissionModule[], b: PermissionModule[]): boolean {
  const x = enabledValues(a).sort();
  const y = enabledValues(b).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
