export const REPORT_ROWS_PER_PAGE = 20;

export function paginateReportRows(rows = []) {
  if (!rows.length) return [[]];
  const pages = [];
  for (let index = 0; index < rows.length; index += REPORT_ROWS_PER_PAGE) {
    pages.push(rows.slice(index, index + REPORT_ROWS_PER_PAGE));
  }
  return pages;
}
