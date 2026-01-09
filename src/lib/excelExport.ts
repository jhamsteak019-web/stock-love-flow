import ExcelJS from 'exceljs';
import { format } from 'date-fns';

interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

interface ExcelExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  columns: ExcelColumn[];
  data: Record<string, any>[];
  headerColor?: string;
  showTotals?: boolean;
  totalColumns?: string[];
}

export const exportToExcel = async ({
  title,
  subtitle,
  filename,
  columns,
  data,
  headerColor = '4472C4',
  showTotals = false,
  totalColumns = [],
}: ExcelExportOptions) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Warehouse Management System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Report');

  // Set column widths
  worksheet.columns = columns.map(col => ({
    key: col.key,
    width: col.width || 15,
  }));

  // Title row
  const titleRow = worksheet.addRow([title]);
  titleRow.font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
  titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
  titleRow.height = 28;
  titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.mergeCells(1, 1, 1, columns.length);

  // Subtitle row (date/period info)
  if (subtitle) {
    const subtitleRow = worksheet.addRow([subtitle]);
    subtitleRow.font = { italic: true, size: 11, color: { argb: '666666' } };
    subtitleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.mergeCells(2, 1, 2, columns.length);
  }

  // Empty row for spacing
  worksheet.addRow([]);

  // Header row
  const headerRow = worksheet.addRow(columns.map(col => col.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFF' } },
    };
  });

  // Data rows
  data.forEach((row, index) => {
    const dataRow = worksheet.addRow(columns.map(col => row[col.key] ?? ''));
    dataRow.alignment = { vertical: 'middle' };
    dataRow.height = 20;
    
    // Alternate row colors
    if (index % 2 === 0) {
      dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
    }
    
    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'DDDDDD' } },
        left: { style: 'thin', color: { argb: 'DDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'DDDDDD' } },
        right: { style: 'thin', color: { argb: 'DDDDDD' } },
      };
    });
  });

  // Totals row
  if (showTotals && totalColumns.length > 0) {
    const totalsData = columns.map(col => {
      if (totalColumns.includes(col.key)) {
        const sum = data.reduce((acc, row) => {
          const val = parseFloat(row[col.key]) || 0;
          return acc + val;
        }, 0);
        return sum.toLocaleString();
      }
      return col.key === columns[0].key ? 'TOTAL' : '';
    });
    
    const totalsRow = worksheet.addRow(totalsData);
    totalsRow.font = { bold: true };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E2E2' } };
    totalsRow.height = 22;
    totalsRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'medium', color: { argb: '333333' } },
        left: { style: 'thin', color: { argb: 'DDDDDD' } },
        bottom: { style: 'medium', color: { argb: '333333' } },
        right: { style: 'thin', color: { argb: 'DDDDDD' } },
      };
    });
  }

  // Footer with generation info
  worksheet.addRow([]);
  const footerRow = worksheet.addRow([`Generated on ${format(new Date(), 'MMMM dd, yyyy HH:mm')}`]);
  footerRow.font = { italic: true, size: 9, color: { argb: '999999' } };

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
