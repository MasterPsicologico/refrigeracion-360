import postgres from 'postgres';

let sql;

export function db() {
  const connectionString =
    process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('Falta configurar DATABASE_URL en Vercel');
  }

  if (!sql) {
    sql = postgres(connectionString, {
      ssl: 'require',
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10
    });
  }

  return sql;
}
