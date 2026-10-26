export type Row = Record<string, any>;
export type Statement = { sql: string; args?: unknown[] };
export interface Database {
  all<T extends Row = Row>(sql: string, args?: unknown[]): Promise<T[]>;
  first<T extends Row = Row>(sql: string, args?: unknown[]): Promise<T | null>;
  run(sql: string, args?: unknown[]): Promise<number>;
  batch(statements: Statement[]): Promise<Row[][]>;
}
export function d1Database(binding: any): Database {
  const prepare = (sql: string, args: unknown[] = []) => binding.prepare(sql).bind(...args);
  return {
    all: async (sql, args) => (await prepare(sql, args).all()).results,
    first: (sql, args) => prepare(sql, args).first(),
    run: async (sql, args) => (await prepare(sql, args).run()).meta.changes,
    batch: async statements => (await binding.batch(statements.map(s => prepare(s.sql, s.args)))).map((r: any) => r.results || []),
  };
}
