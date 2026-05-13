/**
 * db.js — Pool PostgreSQL para o Pinheiro OS.
 *
 * Mesmo servidor PostgreSQL do Maxxi, banco SEPARADO chamado `pinheiro_os`.
 * Vantagens:
 *   - Isolamento total (migração no Maxxi não afeta o Pinheiro)
 *   - Backup/restore independente
 *   - Mesma infra, mesmo custo
 *
 * Config via env:
 *   - DATABASE_URL_PINHEIRO  (opcional — usa este se definido)
 *   - DATABASE_URL            (fallback — troca o nome do db por 'pinheiro_os')
 *
 * `ensureDatabase()` conecta no DB administrativo `postgres` e cria o
 * `pinheiro_os` se necessário (idempotente).
 */
import pg from "pg";
const { Pool } = pg;

const DB_NAME = 'pinheiro_os';
let pool = null;

function buildUrl() {
  if (process.env.DATABASE_URL_PINHEIRO) return process.env.DATABASE_URL_PINHEIRO;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL não definida");
  // Substitui o nome do db (último segmento do path) por `pinheiro_os`.
  // Preserva querystring (sslmode, etc).
  return base.replace(/\/[^/?]+(\?|$)/, `/${DB_NAME}$1`);
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: buildUrl(),
      ssl: false,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on("error", (err) => console.error("❌ PG pool:", err.message));
  }
  return pool;
}

export async function query(sql, params = []) {
  const client = await getPool().connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

export async function withTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Garante que o database `pinheiro_os` existe (cria se necessário).
 * Conecta no DB administrativo `postgres` usando as mesmas credenciais.
 * Idempotente — pode ser chamado em todo boot.
 */
export async function ensureDatabase() {
  // Se o usuário forneceu DATABASE_URL_PINHEIRO explicitamente, assumimos
  // que ele administrou o banco manualmente — não tentamos criar.
  if (process.env.DATABASE_URL_PINHEIRO) return;

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL não definida");

  const adminUrl = base.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const admin = new Pool({
    connectionString: adminUrl,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 8000,
  });

  try {
    const { rows } = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DB_NAME]
    );
    if (!rows.length) {
      await admin.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`✅ [pinheiro] database '${DB_NAME}' criada`);
    } else {
      console.log(`ℹ️  [pinheiro] database '${DB_NAME}' já existe`);
    }
  } catch (e) {
    console.warn(`⚠️ [pinheiro] não foi possível verificar/criar '${DB_NAME}': ${e.message}`);
    console.warn(`   Crie manualmente: psql -c "CREATE DATABASE ${DB_NAME};"`);
    throw e;
  } finally {
    await admin.end().catch(() => {});
  }
}
