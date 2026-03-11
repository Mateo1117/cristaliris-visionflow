export function exportToCSV(data: Record<string, any>[], filename: string, columns: { key: string; label: string }[]) {
  if (data.length === 0) return;

  const header = columns.map(c => c.label).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      let val = row[c.key];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
      return val;
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
