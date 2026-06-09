import * as XLSX from "xlsx";

export interface RawRow {
  [header: string]: string | number | boolean | null | undefined;
}

export interface ParseResult {
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  sheets: string[];
  activeSheet: string;
  headers: string[];
  rows: RawRow[];
  rowCount: number;
}

export async function parseExcelFile(file: File, sheetName?: string): Promise<ParseResult> {
  const uploadedAt = new Date().toISOString();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });

  const sheets = workbook.SheetNames;
  if (sheets.length === 0) throw new Error("הקובץ אינו מכיל גיליונות");

  const activeSheet = sheetName ?? sheets[0];
  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) throw new Error(`גיליון "${activeSheet}" לא נמצא`);

  const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: null, raw: true });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    fileName: file.name,
    fileSize: file.size,
    uploadedAt,
    sheets,
    activeSheet,
    headers,
    rows,
    rowCount: rows.length,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
