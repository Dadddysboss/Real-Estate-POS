/**
 * Centralized Data Sanitization Layer for Turso HTTP API + React Safety
 * 
 * - sanitizeParamsForTurso: Converts outgoing DB params to Turso-compatible format
 * - sanitizeRecordFromDB: Ensures every incoming DB row has safe non-undefined fields
 * - sanitizeRowsFromDB: Batch sanitize an array of DB rows
 * - safeStr: Safe string conversion for any value
 * - safeReplace: Null-safe string replace
 */

// ═══════════════════════════════════════════
// OUTGOING: Turso HTTP parameter serialization
// ═══════════════════════════════════════════

export function sanitizeParamForTurso(p: unknown): { type: string; value?: string } {
  if (p === undefined || p === null) return { type: 'null' };
  if (typeof p === 'number') return { type: 'text', value: String(Number.isNaN(p) ? 0 : p) };
  if (typeof p === 'boolean') return { type: 'text', value: p ? '1' : '0' };
  if (typeof p === 'object') return { type: 'text', value: JSON.stringify(p) };
  return { type: 'text', value: String(p) };
}

export function sanitizeParamsForTurso(params: unknown[]): { type: string; value?: string }[] {
  return params.map(sanitizeParamForTurso);
}

// ═══════════════════════════════════════════
// INCOMING: DB row sanitization for React safety
// ═══════════════════════════════════════════

export function sanitizeRecordFromDB<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== 'object') return {} as T;
  const safe: Record<string, unknown> = {};
  for (const key in row) {
    const val = row[key];
    if (typeof val === 'bigint') {
      safe[key] = Number(val);
    } else if (val === null || val === undefined) {
      safe[key] = '';
    } else if (typeof val === 'object' && !(val instanceof Date)) {
      safe[key] = JSON.stringify(val);
    } else {
      safe[key] = val;
    }
  }
  return safe as T;
}

export function sanitizeRowsFromDB<T extends Record<string, unknown>>(rows: T[]): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(sanitizeRecordFromDB);
}

// ═══════════════════════════════════════════
// SAFE STRING UTILITIES
// ═══════════════════════════════════════════

export function safeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function safeReplace(str: unknown, search: string, replacement: string): string {
  return safeStr(str).split(search).join(replacement);
}

export function safeToLowerCase(v: unknown): string {
  return safeStr(v).toLowerCase();
}

export function safeToUpperCase(v: unknown): string {
  return safeStr(v).toUpperCase();
}

export function safeIncludes(v: unknown, search: string): boolean {
  return safeStr(v).includes(search);
}

export function safeSlice(v: unknown, start?: number, end?: number): string {
  return safeStr(v).slice(start, end);
}

export function safeCharAt(v: unknown, index: number): string {
  return safeStr(v).charAt(index);
}

export function safeTrim(v: unknown): string {
  return safeStr(v).trim();
}

export function safeSplit(v: unknown, separator: string): string[] {
  return safeStr(v).split(separator);
}

// ═══════════════════════════════════════════
// PAYLOAD SANITIZATION (for form submissions)
// ═══════════════════════════════════════════

export function sanitizePayload<T extends Record<string, unknown>>(payload: T): T {
  const clean: Record<string, unknown> = {};
  for (const key in payload) {
    const val = payload[key];
    if (val === undefined) {
      clean[key] = null;
    } else {
      clean[key] = val;
    }
  }
  return clean as T;
}
