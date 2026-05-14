/**
 * db-migrate.js — Schema do Pinheiro OS.
 *
 * Todas as tabelas são CREATE IF NOT EXISTS, então é seguro rodar
 * em todo boot. ALTERs futuros devem ser adicionados no final como
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (PG 9.6+).
 */
import { query } from './db.js';
import { log }   from './logger.js';
import { AUTH }  from './constants.js';

export async function migrate() {
  log.info('[pinheiro] rodando migrações…');

  /* ── Agentes (técnicos + admins) ─────────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS agentes (
      id           SERIAL PRIMARY KEY,
      nome         TEXT NOT NULL,
      login        TEXT UNIQUE NOT NULL,
      senha_hash   TEXT NOT NULL,
      telefone     TEXT,
      avatar       TEXT,
      avatar_url   TEXT,
      role         TEXT NOT NULL DEFAULT 'tecnico'
                   CHECK (role IN ('tecnico','despachador','admin')),
      ativo        BOOLEAN DEFAULT true,
      criado_em    TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_agentes_login ON agentes(LOWER(login))`);

  /* ── Sessões (tokens) ────────────────────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS agente_sessoes (
      token        TEXT PRIMARY KEY,
      agente_id    INTEGER NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
      criado_em    TIMESTAMPTZ DEFAULT NOW(),
      expira_em    TIMESTAMPTZ NOT NULL,
      user_agent   TEXT,
      ultimo_uso   TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessoes_agente ON agente_sessoes(agente_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON agente_sessoes(expira_em)`);

  /* ── Ordens de Serviço ───────────────────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS os (
      id              SERIAL PRIMARY KEY,
      fonte           TEXT NOT NULL CHECK (fonte IN ('SGP','MXX','LOCAL')),
      fonte_id        TEXT,
      tipo            TEXT NOT NULL DEFAULT 'outro',
      status          TEXT NOT NULL DEFAULT 'aguardando',
      prioridade      INTEGER DEFAULT 0,
      cliente_nome    TEXT,
      cliente_doc     TEXT,
      cliente_fone    TEXT,
      endereco        TEXT,
      bairro          TEXT,
      cidade          TEXT,
      cep             TEXT,
      lat             DOUBLE PRECISION,
      lng             DOUBLE PRECISION,
      sla             TIMESTAMPTZ,
      agente_id       INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      descricao       TEXT,
      dados_externos  JSONB DEFAULT '{}',
      criada_em       TIMESTAMPTZ DEFAULT NOW(),
      atualizada_em   TIMESTAMPTZ DEFAULT NOW(),
      iniciada_em     TIMESTAMPTZ,
      fechada_em      TIMESTAMPTZ,
      UNIQUE (fonte, fonte_id)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_os_agente   ON os(agente_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_os_status   ON os(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_os_sla      ON os(sla) WHERE sla IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_os_fonte    ON os(fonte, fonte_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_os_geo      ON os(lat, lng) WHERE lat IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_os_doc      ON os(cliente_doc) WHERE cliente_doc IS NOT NULL`);

  /* ── Timeline / Eventos ──────────────────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS os_eventos (
      id           BIGSERIAL PRIMARY KEY,
      os_id        INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
      tipo         TEXT NOT NULL,
      agente_id    INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      dados        JSONB DEFAULT '{}',
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_eventos_os ON os_eventos(os_id, criado_em DESC)`);

  /* ── Fotos com geotag ────────────────────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS os_fotos (
      id           SERIAL PRIMARY KEY,
      os_id        INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
      url          TEXT NOT NULL,
      thumb_url    TEXT,
      lat          DOUBLE PRECISION,
      lng          DOUBLE PRECISION,
      accuracy     REAL,
      tirada_em    TIMESTAMPTZ DEFAULT NOW(),
      agente_id    INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      tamanho_b    INTEGER,
      mime         TEXT,
      hash         TEXT
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_fotos_os ON os_fotos(os_id, tirada_em DESC)`);

  /* ── Checklist por OS ────────────────────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS os_checklist (
      id           SERIAL PRIMARY KEY,
      os_id        INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
      item         TEXT NOT NULL,
      feito        BOOLEAN DEFAULT false,
      ordem        INTEGER DEFAULT 0,
      feito_em     TIMESTAMPTZ,
      agente_id    INTEGER REFERENCES agentes(id) ON DELETE SET NULL
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_checklist_os ON os_checklist(os_id, ordem)`);

  /* ── Observações / Relatos (manual ou por voz) ───────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS os_observacoes (
      id           SERIAL PRIMARY KEY,
      os_id        INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
      texto        TEXT NOT NULL,
      fonte        TEXT DEFAULT 'manual' CHECK (fonte IN ('manual','voz','sistema')),
      agente_id    INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_obs_os ON os_observacoes(os_id, criado_em DESC)`);

  /* ── Posição do agente (heartbeat) ───────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS agente_posicao (
      agente_id    INTEGER PRIMARY KEY REFERENCES agentes(id) ON DELETE CASCADE,
      lat          DOUBLE PRECISION NOT NULL,
      lng          DOUBLE PRECISION NOT NULL,
      accuracy     REAL,
      bateria      INTEGER,
      atualizado   TIMESTAMPTZ DEFAULT NOW()
    )`);

  /* ── Push notifications (Web Push) ───────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           SERIAL PRIMARY KEY,
      agente_id    INTEGER REFERENCES agentes(id) ON DELETE CASCADE,
      endpoint     TEXT UNIQUE NOT NULL,
      p256dh       TEXT NOT NULL,
      auth         TEXT NOT NULL,
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_agente ON push_subscriptions(agente_id)`);

  /* ── IA: feedback de duplicadas (humano corrige IA) ──────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS ia_duplicadas_feedback (
      id           SERIAL PRIMARY KEY,
      os_a         INTEGER NOT NULL,
      os_b         INTEGER NOT NULL,
      dispensada   BOOLEAN DEFAULT true,
      agente_id    INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      criado_em    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (os_a, os_b)
    )`);

  /* ── IA: cache de diagnósticos (1h TTL via gerado_em) ────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS ia_diagnosticos_cache (
      os_id        INTEGER PRIMARY KEY REFERENCES os(id) ON DELETE CASCADE,
      payload      JSONB NOT NULL,
      gerado_em    TIMESTAMPTZ DEFAULT NOW()
    )`);

  /* ── Audit log (LGPD + segurança) ────────────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           BIGSERIAL PRIMARY KEY,
      agente_id    INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      acao         TEXT NOT NULL,
      recurso      TEXT,
      detalhes     JSONB,
      ip           INET,
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_agente ON audit_log(agente_id, criado_em DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_acao   ON audit_log(acao, criado_em DESC)`);

  /* ── Veículo do dia + estoque no carro ───────────────────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS agente_veiculo (
      id           SERIAL PRIMARY KEY,
      agente_id    INTEGER NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
      dia          DATE NOT NULL,
      placa        TEXT,
      km_inicial   INTEGER,
      km_final     INTEGER,
      observacao   TEXT,
      UNIQUE (agente_id, dia)
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS agente_estoque (
      id           SERIAL PRIMARY KEY,
      agente_id    INTEGER NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
      codigo       TEXT NOT NULL,
      descricao    TEXT,
      qtd          INTEGER DEFAULT 0,
      atualizado   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (agente_id, codigo)
    )`);

  /* ── KV genérico (cursor de sync, configs runtime) ───────────────────── */
  await query(`
    CREATE TABLE IF NOT EXISTS sistema_kv (
      chave        TEXT PRIMARY KEY,
      valor        JSONB,
      atualizado   TIMESTAMPTZ DEFAULT NOW()
    )`);

  log.info('[pinheiro] migrações concluídas');
}

/**
 * Cria um admin inicial só se não houver NENHUM agente cadastrado.
 * Senha padrão para o primeiro login — TROCAR via PUT /api/agentes/me/senha.
 */
export async function seedAdmin() {
  const r = await query(`SELECT COUNT(*)::int AS n FROM agentes`);
  if (r.rows[0].n > 0) return;

  const bcrypt = await import('@node-rs/bcrypt');
  const senha = process.env.PINHEIRO_ADMIN_SENHA || 'admin123';
  const hash  = await bcrypt.hash(senha, AUTH.bcrypt_rounds);
  await query(
    `INSERT INTO agentes(nome, login, senha_hash, role, ativo)
     VALUES ('Administrador Pinheiro', 'admin', $1, 'admin', true)`,
    [hash]
  );
  log.info(`[pinheiro] admin inicial criado — login='admin' senha='${senha}'`);
  log.warn('[pinheiro] ⚠️  TROQUE a senha no primeiro login!');
}
