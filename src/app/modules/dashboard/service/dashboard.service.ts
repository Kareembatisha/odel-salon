import { Injectable, inject, signal } from '@angular/core';
import { catchError, finalize, of } from 'rxjs';

import { environment } from '@env/environment';
import { DashboardSummary } from '../model/dashboard.model';
import { DashboardApiRepository } from '../repository/dashboard-api.repository';
import { DashboardMockRepository } from '../repository/dashboard-mock.repository';
import { IDashboardRepository } from '../repository/dashboard.repository';

/**
 * DashboardService — business/UI state for the dashboard page (signals).
 * Same shape every feature service follows: `loading`, `hasError`, data signal, `load()`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly repository: IDashboardRepository = environment.useMock
    ? inject(DashboardMockRepository)
    : inject(DashboardApiRepository);

  private readonly _summary = signal<DashboardSummary | null>(null);
  private readonly _loading = signal(false);
  private readonly _hasError = signal(false);

  readonly summary = this._summary.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasError = this._hasError.asReadonly();

  load(branchId?: number): void {
    this._loading.set(true);
    this._hasError.set(false);
    this.repository
      .getSummary(branchId)
      .pipe(
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => this._loading.set(false)),
      )
      .subscribe((res) => {
        if (res?.data) this._summary.set(res.data);
        else if (res) this._hasError.set(true);
      });
  }
}
