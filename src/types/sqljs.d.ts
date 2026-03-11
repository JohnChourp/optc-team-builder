declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[];
    values: Array<Array<string | number | null>>;
  }

  export interface Database {
    run(sql: string): void;
    exec(sql: string, params?: Array<string | number>): QueryExecResult[];
  }

  export interface SqlJsStatic {
    Database: new () => Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
