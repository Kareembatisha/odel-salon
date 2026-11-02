import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChild,
  contentChildren,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { SkeletonComponent } from '../skeleton/skeleton.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

/**
 * Declares one column. The template receives the row as `let-row`.
 *
 *   <app-data-table [data]="rows()" ...>
 *     <ng-template odlCol="name" label="Branch" width="2fr" let-row>{{ row.name }}</ng-template>
 *     <ng-template odlCol="actions" label="" align="end" width="96px" let-row>…</ng-template>
 *   </app-data-table>
 */
@Directive({ selector: 'ng-template[odlCol]', standalone: true })
export class DataTableColumnDirective {
  readonly key = input.required<string>({ alias: 'odlCol' });
  /** Already-translated header text. */
  readonly label = input<string>('');
  /** Any CSS width: "2fr", "120px", "20%". Defaults to equal share. */
  readonly width = input<string>('1fr');
  readonly align = input<'start' | 'center' | 'end'>('start');
  readonly template = inject<TemplateRef<{ $implicit: unknown; row: unknown; index: number }>>(TemplateRef);
}

/** Context handed to a `let-row` mobile-card template: the row, plus this table's selection state for it. */
export interface DataTableCardContext<T> {
  $implicit: T;
  row: T;
  index: number;
  selected: boolean;
  locked: boolean;
  toggleSelected: () => void;
}

/**
 * Optional narrow-viewport layout for a row. When supplied, it replaces the
 * <table> below `styles/_spacing.scss`'s `$bp-md` (768px) — same data, same
 * selection, same pagination, laid out as a card instead of table cells.
 *
 *   <ng-template odlCard let-row let-selected="selected" let-toggleSelected="toggleSelected">…</ng-template>
 */
@Directive({ selector: 'ng-template[odlCard]', standalone: true })
export class DataTableCardDirective<T> {
  readonly template = inject<TemplateRef<DataTableCardContext<T>>>(TemplateRef);
}

/**
 * DataTable — the list surface of the design system: real <table> semantics,
 * sticky header, row hover, skeleton loading, empty state and pagination.
 * Pagination is server-driven: parent owns `page` and listens to `pageChange`.
 */
@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [NgTemplateOutlet, TranslateModule, SkeletonComponent, EmptyStateComponent],
  host: { '[class.dt-host--has-cards]': '!!cardTemplate()' },
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent<T extends { id: string | number }> {
  data = input<T[]>([]);
  totalRecords = input<number>(0);
  page = input<number>(1);
  pageSize = input<number>(10);
  loading = input<boolean>(false);
  emptyTitle = input<string>('');
  emptyDescription = input<string>('');
  emptyIcon = input<string>('pi pi-inbox');
  /** Accessible table name. */
  caption = input<string>('');

  /** Adds a checkbox column. Selected row ids are two-way bound with [(selection)]. */
  selectable = input<boolean>(false);
  selection = model<Array<string | number>>([]);
  /** Ids that can't be selected (e.g. the signed-in user's own row). */
  lockedIds = input<ReadonlyArray<string | number>>([]);
  selectAllLabel = input<string>('Select all');
  selectRowLabel = input<string>('Select row');

  pageChange = output<number>();
  rowClick = output<T>();

  protected columns = contentChildren(DataTableColumnDirective);
  /** Optional narrow-viewport card template supplied by the host (see DataTableCardDirective). */
  protected cardTemplate = contentChild(DataTableCardDirective);

  protected totalPages = computed(() => Math.max(1, Math.ceil(this.totalRecords() / this.pageSize())));
  protected rangeStart = computed(() => (this.totalRecords() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  protected rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.totalRecords()));
  protected skeletonRows = computed(() => Array.from({ length: Math.min(this.pageSize(), 6) }, (_, i) => i));

  protected visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const max = 5;
    let start = Math.max(1, current - Math.floor(max / 2));
    const end = Math.min(total, start + max - 1);
    start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  protected cardContext(row: T, index: number): DataTableCardContext<T> {
    return {
      $implicit: row,
      row,
      index,
      selected: this.selection().includes(row.id),
      locked: this.lockedIds().includes(row.id),
      toggleSelected: () => this.toggleRow(row.id),
    };
  }

  protected selectableIds = computed(() => this.data().map((r) => r.id).filter((id) => !this.lockedIds().includes(id)));
  protected allSelected = computed(
    () => this.selectableIds().length > 0 && this.selectableIds().every((id) => this.selection().includes(id)),
  );
  protected someSelected = computed(() => !this.allSelected() && this.selectableIds().some((id) => this.selection().includes(id)));

  protected toggleAll(): void {
    this.selection.set(this.allSelected() ? [] : [...this.selectableIds()]);
  }

  protected toggleRow(id: string | number): void {
    this.selection.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  protected goTo(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.pageChange.emit(page);
  }
}
