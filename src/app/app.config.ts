import {
  ApplicationConfig,
  ErrorHandler,
  provideZoneChangeDetection,
  importProvidersFrom,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { provideHttpClient, withInterceptors, HttpClient } from "@angular/common/http";
import { providePrimeNG } from "primeng/config";
import { TranslateModule, TranslateLoader } from "@ngx-translate/core";
import { TranslateHttpLoader } from "@ngx-translate/http-loader";

import { routes } from "./app.routes";
import { OdelPreset } from "./core/theme/odel-preset";
import { tokenInterceptor } from "./core/interceptors/token.interceptor";
import { errorInterceptor } from "./core/interceptors/error.interceptor";
import { langInterceptor } from "./core/interceptors/lang.interceptor";
import { GlobalErrorHandler } from "./core/services/global-error-handler";
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

export function httpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, "./assets/i18n/", ".json");
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),

    // Catches uncaught errors app-wide so a single bad field can't blank the page.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },

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

    // HTTP + interceptors (token first, lang alongside it on the way out,
    // error catches on the way back).
    provideHttpClient(withInterceptors([tokenInterceptor, langInterceptor, errorInterceptor])),

    // ⚠️ MessageService is NOT provided here — it lives at component level
    //    inside AppToast to avoid NG0200 circular dependency.

    providePrimeNG({
      theme: {
        preset: OdelPreset,
        options: {
          // ThemeService toggles <html data-theme="dark">.
          darkModeSelector: '[data-theme="dark"]',
          cssLayer: {
            name: "primeng",
            order: "tailwind-base, primeng, tailwind-utilities",
          },
        },
      },
    }),

    importProvidersFrom(
      TranslateModule.forRoot({
        fallbackLang: "en",
        loader: {
          provide: TranslateLoader,
          useFactory: httpLoaderFactory,
          deps: [HttpClient],
        },
      }),
    ),
  ],
};
