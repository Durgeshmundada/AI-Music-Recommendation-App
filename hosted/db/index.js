export function database(env) {
  if (!env.DB) throw new Error('The music database is unavailable.');
  return env.DB;
}
export function statement(env, sql, ...values) {
  return database(env).prepare(sql).bind(...values);
}
export async function rows(env, sql, ...values) {
  return (await statement(env, sql, ...values).all()).results;
}
