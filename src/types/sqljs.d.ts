declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[];
    values: Array<Array<string | number | null>>;
  }

  export interface Database {
    run(sql: string): void;
    exec(sql: string, params?: Array<string | number>): QueryExecResult[];
    close(): void;
  }

  export interface SqlJsStatic {
    /* 869f138q7. With bytes, opens an existing database file instead of an empty one. */
    Database: new (data?: Uint8Array | null) => Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
