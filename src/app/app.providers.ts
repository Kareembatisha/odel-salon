import { Provider } from "@angular/core";

import { environment } from "@env/environment";
import { BranchApiRepository } from "@modules/branches/repository/branch-api.repository";
import { BranchMockRepository } from "@modules/branches/repository/branch-mock.repository";
import { BRANCH_REPOSITORY } from "@modules/branches/repository/branch.repository";
import { ChairApiRepository } from "@modules/chairs/repository/chair-api.repository";
import { ChairMockRepository } from "@modules/chairs/repository/chair-mock.repository";
import { CHAIR_REPOSITORY } from "@modules/chairs/repository/chair.repository";
import { BarberApiRepository } from "@modules/barbers/repository/barber-api.repository";
import { BarberMockRepository } from "@modules/barbers/repository/barber-mock.repository";
import { BARBER_REPOSITORY } from "@modules/barbers/repository/barber.repository";
import { ServiceApiRepository } from "@modules/services/repository/service-api.repository";
import { ServiceMockRepository } from "@modules/services/repository/service-mock.repository";
import { SERVICE_REPOSITORY } from "@modules/services/repository/service.repository";
import { PackageApiRepository } from "@modules/packages/repository/package-api.repository";
import { PackageMockRepository } from "@modules/packages/repository/package-mock.repository";
import { PACKAGE_REPOSITORY } from "@modules/packages/repository/package.repository";
import { OfferApiRepository } from "@modules/offers/repository/offer-api.repository";
import { OfferMockRepository } from "@modules/offers/repository/offer-mock.repository";
import { OFFER_REPOSITORY } from "@modules/offers/repository/offer.repository";
import { UserApiRepository } from "@modules/users/repository/user-api.repository";
import { UserMockRepository } from "@modules/users/repository/user-mock.repository";
import { USER_REPOSITORY } from "@modules/users/repository/user.repository";
import { RoleApiRepository } from "@modules/roles/repository/role-api.repository";
import { RoleMockRepository } from "@modules/roles/repository/role-mock.repository";
import { ROLE_REPOSITORY } from "@modules/roles/repository/role.repository";
import { DashboardApiRepository } from "@modules/dashboard/repository/dashboard-api.repository";
import { DashboardMockRepository } from "@modules/dashboard/repository/dashboard-mock.repository";
import { DASHBOARD_REPOSITORY } from "@modules/dashboard/repository/dashboard.repository";
import { ProfileApiRepository } from "@modules/profile-management/repository/profile-api.repository";
import { ProfileMockRepository } from "@modules/profile-management/repository/profile-mock.repository";
import { PROFILE_REPOSITORY } from "@modules/profile-management/repository/profile.repository";
import { AuthApiRepository } from "@modules/auth/repository/auth-api.repository";
import { AuthMockRepository } from "@modules/auth/repository/auth-mock.repository";
import { AUTH_REPOSITORY } from "@modules/auth/repository/auth.repository";

/**
 * Repository providers for DEVELOPMENT and TESTS: `environment.useMock` picks the in-memory
 * mock or the real API.
 *
 * The production build replaces this file with `app.providers.prod.ts` (angular.json
 * `fileReplacements`), which does not import any mock code. Keep both files in sync:
 * every repository token appears in each.
 */
export const DATA_PROVIDERS: Provider[] = [
  {
    provide: BRANCH_REPOSITORY,
    useClass: environment.useMock ? BranchMockRepository : BranchApiRepository,
  },
  {
    provide: CHAIR_REPOSITORY,
    useClass: environment.useMock ? ChairMockRepository : ChairApiRepository,
  },
  {
    provide: BARBER_REPOSITORY,
    useClass: environment.useMock ? BarberMockRepository : BarberApiRepository,
  },
  {
    provide: SERVICE_REPOSITORY,
    useClass: environment.useMock ? ServiceMockRepository : ServiceApiRepository,
  },
  {
    provide: PACKAGE_REPOSITORY,
    useClass: environment.useMock ? PackageMockRepository : PackageApiRepository,
  },
  {
    provide: OFFER_REPOSITORY,
    useClass: environment.useMock ? OfferMockRepository : OfferApiRepository,
  },
  {
    provide: USER_REPOSITORY,
    useClass: environment.useMock ? UserMockRepository : UserApiRepository,
  },
  {
    provide: ROLE_REPOSITORY,
    useClass: environment.useMock ? RoleMockRepository : RoleApiRepository,
  },
  {
    provide: DASHBOARD_REPOSITORY,
    useClass: environment.useMock ? DashboardMockRepository : DashboardApiRepository,
  },
  {
    provide: PROFILE_REPOSITORY,
    useClass: environment.useMock ? ProfileMockRepository : ProfileApiRepository,
  },
  {
    provide: AUTH_REPOSITORY,
    useClass: environment.useMock ? AuthMockRepository : AuthApiRepository,
  },
];
