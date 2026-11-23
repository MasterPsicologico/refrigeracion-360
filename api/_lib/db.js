import postgres from 'postgres';
let sql;
export function db(){ if(!process.env.DATABASE_URL) throw new Error('Falta configurar DATABASE_URL en Vercel'); if(!sql) sql=postgres(process.env.DATABASE_URL,{ssl:'require',max:5,idle_timeout:20,connect_timeout:10}); return sql; }
