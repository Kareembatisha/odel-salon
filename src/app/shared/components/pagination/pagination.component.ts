import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";

/**
 * Pagination — range text + page buttons for lists that aren't a table (e.g. card grids).
 * Server-driven like DataTable's footer: the parent owns `page` and listens to `pageChange`.
 * Hidden when there are no records.
 */
@Component({
  selector: "app-pagination",
  standalone: true,
  imports: [TranslateModule],
  template: `
    @if (totalRecords() > 0) {
      <footer class="pg">
        <span class="pg__range u-num">
          {{ 'COMMON.TABLE.SHOWING' | translate }}
          <strong>{{ rangeStart() }}–{{ rangeEnd() }}</strong>
          {{ 'COMMON.TABLE.OF' | translate }}
          <strong>{{ totalRecords() }}</strong>
        </span>

        <nav class="pg__pager" [attr.aria-label]="'COMMON.TABLE.PAGINATION' | translate">
          <button type="button" class="pg__page pg__page--arrow" [disabled]="page() === 1"
            [attr.aria-label]="'COMMON.PREVIOUS' | translate" (click)="goTo(page() - 1)">
            <i class="pi pi-angle-left"></i>
          </button>
          @for (p of visiblePages(); track p) {
            <button type="button" class="pg__page u-num" [class.pg__page--active]="p === page()"
              [attr.aria-current]="p === page() ? 'page' : null" (click)="goTo(p)">{{ p }}</button>
          }
          <button type="button" class="pg__page pg__page--arrow" [disabled]="page() === totalPages()"
            [attr.aria-label]="'COMMON.NEXT' | translate" (click)="goTo(page() + 1)">
            <i class="pi pi-angle-right"></i>
          </button>
        </nav>
      </footer>
    }
  `,
  styleUrl: "./pagination.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  page = input<number>(1);
  pageSize = input<number>(10);
  totalRecords = input<number>(0);

  pageChange = output<number>();

  protected totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRecords() / this.pageSize())),
  );
  protected rangeStart = computed(() =>
    this.totalRecords() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  protected rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.totalRecords()));

  protected visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const max = 5;
    let start = Math.max(1, current - Math.floor(max / 2));
    const end = Math.min(total, start + max - 1);
    start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  protected goTo(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.pageChange.emit(page);
  }
}
