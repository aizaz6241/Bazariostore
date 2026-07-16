import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// columns: [{ key, label, width? }], rows: [obj]
export async function sendReport(res, { title, columns, rows, format = 'json' }) {
  const safe = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  if (format === 'csv') {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [columns.map((c) => esc(c.label)).join(',')]
      .concat(rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')))
      .join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.csv"`);
    return res.send('﻿' + csv);
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(title.slice(0, 30));
    ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width || 18 }));
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE3EC' } };
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`);
    return res.send(Buffer.from(buf));
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ layout: 'landscape', margin: 30, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on('end', resolve));

    doc.fontSize(15).fillColor('#E0446E').text('Official Nayab Glow', { continued: true });
    doc.fillColor('#333').text('  —  ' + title);
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#777').text('Generated: ' + new Date().toLocaleString('en-PK'));
    doc.moveDown(0.8);

    const pageW = doc.page.width - 60;
    const colW = pageW / columns.length;
    const rowH = 16;
    let y = doc.y;

    const drawRow = (vals, bold = false) => {
      if (y > doc.page.height - 45) {
        doc.addPage();
        y = 40;
      }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(bold ? '#A91E47' : '#222');
      vals.forEach((v, i) => {
        doc.text(String(v == null ? '' : v).slice(0, 40), 30 + i * colW, y, { width: colW - 4, lineBreak: false });
      });
      y += rowH;
      doc.moveTo(30, y - 4).lineTo(30 + pageW, y - 4).strokeColor('#EEE').lineWidth(0.5).stroke();
    };

    drawRow(columns.map((c) => c.label), true);
    rows.forEach((r) => drawRow(columns.map((c) => r[c.key])));
    doc.end();
    await done;
    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
    return res.send(buf);
  }

  return res.json({ title, columns, rows });
}
