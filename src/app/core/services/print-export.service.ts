import { Injectable, signal } from '@angular/core';

/**
 * "PDF export" strategy: instead of a heavy client-side PDF library,
 * we mark the printable region with the .print-section class (see
 * styles.scss @media print rules) and invoke the browser's native
 * Print dialog, where the user chooses "Save as PDF".
 *
 * Usage in a component:
 *   <div id="invoice" class="print-section">...</div>
 *   <button (click)="printExport.printElement('invoice')">Export PDF</button>
 */
@Injectable({ providedIn: 'root' })
export class PrintExportService {
  readonly isPrinting = signal(false);

  printElement(elementId: string, documentTitle?: string): void {
    const el = document.getElementById(elementId);
    if (!el) {
      console.warn(`PrintExportService: element #${elementId} not found`);
      return;
    }

    // Ensure only this element matches .print-section during print.
    document.querySelectorAll('.print-section').forEach((n) => n.classList.remove('print-section'));
    el.classList.add('print-section');

    const previousTitle = document.title;
    if (documentTitle) document.title = documentTitle;

    this.isPrinting.set(true);
    window.requestAnimationFrame(() => {
      window.print();
      this.isPrinting.set(false);
      document.title = previousTitle;
      el.classList.remove('print-section');
    });
  }

  /** Print the whole current view (no scoped element). */
  printPage(): void {
    window.print();
  }
}
