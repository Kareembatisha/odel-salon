import { Injectable, inject, signal } from "@angular/core";
import { Subscription, catchError, finalize, of } from "rxjs";

import { PaginationMeta } from "@shared/model/api_response.model";
import { BranchListItem, BranchesQuery } from "../model/branch.model";
import { BRANCH_REPOSITORY } from "../repository/branch.repository";

const PAGE_SIZE = 12;

/**
 * BranchesService — list state (server-side search, visibility filter, paging).
 * Phase 1 is read-only; mutations arrive with their phases.
 */
@Injectable({ providedIn: "root" })
export class BranchesService {
  private readonly repository = inject(BRANCH_REPOSITORY);

  private readonly _branches = signal<BranchListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<BranchesQuery>({
    pageNumber: 1,
    pageSize: PAGE_SIZE,
  });
  private readonly _loading = signal(false);
  private readonly _hasError = signal(false);

  /** In-flight list request — a newer one cancels it so a slow, stale response can't overwrite fresh results. */
  private inFlight?: Subscription;
  private requestId = 0;

  readonly branches = this._branches.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasError = this._hasError.asReadonly();

  load(): void {
    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getBranches(this._query())
      .pipe(
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => {
          if (currentRequest === this.requestId) {
            this._loading.set(false);
          }
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this._branches.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /** Any filter change goes back to page 1. */
  setFilters(
    filters: Partial<Pick<BranchesQuery, "search" | "isVisible">>,
  ): void {
    this._query.update((q) => ({ ...q, ...filters, pageNumber: 1 }));
    this.load();
  }

  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }
}
