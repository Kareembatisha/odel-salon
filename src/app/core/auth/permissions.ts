/**
 * Permission catalog — the single list of `Resource.Action` strings the
 * dashboard understands. The backend returns the user's granted subset at
 * login/refresh (see AuthService.permissions); routes (`permissionGuard`) and
 * the sidebar both check against these.
 *
 * Add a resource here first, then use PERMISSIONS.<Resource>.<Action> in
 * routes and nav config — never a raw string.
 */
const SPEC = {
  Booking: ['View', 'Cancel'],
  Session: ['View', 'Manage'],
  Availability: ['View'],
  Branch: ['View', 'Create', 'Edit', 'Delete'],
  Service: ['View', 'Create', 'Edit', 'Delete'],
  Barber: ['View', 'Create', 'Edit', 'Delete'],
  Chair: ['View', 'Create', 'Edit', 'ToggleStatus', 'Delete'],
  Offer: ['View', 'Create', 'Edit', 'Delete'],
  Points: ['View', 'Manage'],
  Review: ['View', 'Moderate'],
  Report: ['View', 'Export'],
  Settings: ['View', 'Manage'],
  User: ['View', 'Create', 'Edit', 'Delete'],
  Role: ['View', 'Create', 'Edit', 'Delete'],
} as const;

type Spec = typeof SPEC;

export type Permission = {
  [R in keyof Spec]: `${R}.${Spec[R][number]}`;
}[keyof Spec];

type PermissionMap = {
  [R in keyof Spec]: { [A in Spec[R][number]]: `${R}.${A}` };
};

export const PERMISSIONS = Object.fromEntries(
  (Object.keys(SPEC) as (keyof Spec)[]).map((resource) => [
    resource,
    Object.fromEntries(SPEC[resource].map((action) => [action, `${resource}.${action}`])),
  ]),
) as unknown as PermissionMap;

export const ALL_PERMISSIONS: Permission[] = (Object.keys(SPEC) as (keyof Spec)[]).flatMap((resource) =>
  SPEC[resource].map((action) => `${resource}.${action}` as Permission),
);

/** Catalog as `[{ module, actions }]` — used by mock data and to label permission matrices. */
export const PERMISSION_MODULES: ReadonlyArray<{ module: string; actions: readonly string[] }> = (
  Object.keys(SPEC) as (keyof Spec)[]
).map((module) => ({ module, actions: SPEC[module] }));
