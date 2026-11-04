import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { OdelPreset } from './core/theme/odel-preset';
import { tokenInterceptor } from './core/interceptors/token.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { langInterceptor } from './core/interceptors/lang.interceptor';
import { GlobalErrorHandler } from './core/services/global-error-handler';
import { environment } from '@env/environment';
import { BranchApiRepository } from '@modules/branches/repository/branch-api.repository';
import { BranchMockRepository } from '@modules/branches/repository/branch-mock.repository';
import { BRANCH_REPOSITORY } from '@modules/branches/repository/branch.repository';
import { ChairApiRepository } from '@modules/chairs/repository/chair-api.repository';
import { ChairMockRepository } from '@modules/chairs/repository/chair-mock.repository';
import { CHAIR_REPOSITORY } from '@modules/chairs/repository/chair.repository';

export function httpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
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
      useClass: environment.useMock
        ? BranchMockRepository
        : BranchApiRepository,
    },

    {
      provide: CHAIR_REPOSITORY,
      useClass: environment.useMock ? ChairMockRepository : ChairApiRepository,
    },

    // HTTP + interceptors (token first, lang alongside it on the way out,
    // error catches on the way back).
    provideHttpClient(
      withInterceptors([tokenInterceptor, langInterceptor, errorInterceptor]),
    ),

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
