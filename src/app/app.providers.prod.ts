import { Provider } from "@angular/core";

import { BranchApiRepository } from "@modules/branches/repository/branch-api.repository";
import { BRANCH_REPOSITORY } from "@modules/branches/repository/branch.repository";
import { ChairApiRepository } from "@modules/chairs/repository/chair-api.repository";
import { CHAIR_REPOSITORY } from "@modules/chairs/repository/chair.repository";
import { BarberApiRepository } from "@modules/barbers/repository/barber-api.repository";
import { BARBER_REPOSITORY } from "@modules/barbers/repository/barber.repository";
import { ServiceApiRepository } from "@modules/services/repository/service-api.repository";
import { SERVICE_REPOSITORY } from "@modules/services/repository/service.repository";
import { PackageApiRepository } from "@modules/packages/repository/package-api.repository";
import { PACKAGE_REPOSITORY } from "@modules/packages/repository/package.repository";
import { OfferApiRepository } from "@modules/offers/repository/offer-api.repository";
import { OFFER_REPOSITORY } from "@modules/offers/repository/offer.repository";
import { UserApiRepository } from "@modules/users/repository/user-api.repository";
import { USER_REPOSITORY } from "@modules/users/repository/user.repository";
import { RoleApiRepository } from "@modules/roles/repository/role-api.repository";
import { ROLE_REPOSITORY } from "@modules/roles/repository/role.repository";
import { DashboardApiRepository } from "@modules/dashboard/repository/dashboard-api.repository";
import { DASHBOARD_REPOSITORY } from "@modules/dashboard/repository/dashboard.repository";
import { ProfileApiRepository } from "@modules/profile-management/repository/profile-api.repository";
import { PROFILE_REPOSITORY } from "@modules/profile-management/repository/profile.repository";
import { AuthApiRepository } from "@modules/auth/repository/auth-api.repository";
import { AUTH_REPOSITORY } from "@modules/auth/repository/auth.repository";

/**
 * Repository providers for PRODUCTION builds — API implementations only.
 *
 * Swapped in for `app.providers.ts` by the `production` and `production-brand-template`
 * configurations (angular.json `fileReplacements`). It must never import a `*-mock.repository`
 * or anything under `core/mock`: `npm run check:prod-bundle` fails the build check if mock code
 * reaches the bundle.
 */
export const DATA_PROVIDERS: Provider[] = [
  { provide: BRANCH_REPOSITORY, useClass: BranchApiRepository },
  { provide: CHAIR_REPOSITORY, useClass: ChairApiRepository },
  { provide: BARBER_REPOSITORY, useClass: BarberApiRepository },
  { provide: SERVICE_REPOSITORY, useClass: ServiceApiRepository },
  { provide: PACKAGE_REPOSITORY, useClass: PackageApiRepository },
  { provide: OFFER_REPOSITORY, useClass: OfferApiRepository },
  { provide: USER_REPOSITORY, useClass: UserApiRepository },
  { provide: ROLE_REPOSITORY, useClass: RoleApiRepository },
  { provide: DASHBOARD_REPOSITORY, useClass: DashboardApiRepository },
  { provide: PROFILE_REPOSITORY, useClass: ProfileApiRepository },
  { provide: AUTH_REPOSITORY, useClass: AuthApiRepository },
];
