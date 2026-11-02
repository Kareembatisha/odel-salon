import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND } from '../brand/brand';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  /**
   * Export an array of plain objects to a styled .xlsx file.
   *
   * Usage:
   *   this.excelExport.export('Barbers', [
   *     { header: 'Name', key: 'name', width: 25 },
   *     { header: 'Branch', key: 'dept', width: 20 },
   *   ], this.employees());
   */
  async export<T extends object>(
    sheetName: string,
    columns: ExcelColumn[],
    rows: T[],
    fileName = sheetName
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = BRAND.name;
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ rightToLeft: document.documentElement.dir === 'rtl' }]
    });

    sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF1F1D1A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC29C45' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    rows.forEach((row) => sheet.addRow(row));

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0DCD3' } },
          bottom: { style: 'thin', color: { argb: 'FFE0DCD3' } },
          left: { style: 'thin', color: { argb: 'FFE0DCD3' } },
          right: { style: 'thin', color: { argb: 'FFE0DCD3' } }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: 'application/octet-stream' }),
      `${fileName}.xlsx`
    );
  }
}
