/**
 * Pinheiro OS — Rotas de autenticação dos agentes.
 * Montado em /api/agentes/*
 *
 * Token strategy: random 28 bytes em base64url, gravado em `agente_sessoes`,
 * TTL 30 dias, renovado a cada uso. Header: x-admin-token (mesmo nome do Maxxi
 * para o frontend reaproveitar a função api() do shared.js).
 *
 * Mitigações:
 *   - Timing attack: dummy bcrypt.compare quando login não existe
 *   - Brute force: rate limit no /login (montado no server.js)
 *   - Session sprawl: limita N sessões por agente (revoga as mais antigas)
 *   - Audit: cada login/logout/troca-senha grava em audit_log
 */
import { Router }      from 'express';
import bcrypt          from '@node-rs/bcrypt';
import crypto          from 'node:crypto';
import { query }       from '../services/db.js';
import { log }         from '../services/logger.js';
import { audit }       from '../services/audit.js';
import { AUTH }        from '../services/constants.js';

const router = Router();

// Dummy hash usado contra timing attack quando o login não existe.
// Gerado uma vez por boot — bcrypt.compare contra esse hash leva o mesmo
// tempo que comparar contra um hash real, mascarando a diferença.
let _dummyHash = null;
async function getDummyHash() {
  if (_dummyHash) return _dummyHash;
  _dummyHash = await bcrypt.hash(AUTH.dummy_hash_seed, AUTH.bcrypt_rounds);
  return _dummyHash;
}
// Pre-warm — não bloqueia se falhar
getDummyHash().catch(e => log.warn('[auth] dummy hash pre-warm falhou:', e.message));

/* ── Middleware: lê x-admin-token, valida sessão, popula req.agente ────── */
export async function authMw(req, res, next) {
  const token = req.header('x-admin-token');
  if (!token) return res.status(401).json({ error: 'token ausente' });

  try {
    const { rows } = await query(
      `SELECT s.token, s.agente_id, s.expira_em,
              a.nome, a.login, a.role, a.avatar_url, a.ativo
       FROM agente_sessoes s
       JOIN agentes a ON a.id = s.agente_id
       WHERE s.token = $1 AND s.expira_em > NOW()`,
      [token]
    );
    if (!rows.length)  return res.status(401).json({ error: 'sessão expirada' });
    if (!rows[0].ativo) return res.status(403).json({ error: 'agente inativo' });

    req.agente = rows[0];

    // Atualiza ultimo_uso async, não bloqueia request
    query(`UPDATE agente_sessoes SET ultimo_uso = NOW() WHERE token = $1`, [token])
      .catch(() => {});

    next();
  } catch (e) {
    log.error('[auth/mw]', e.message);
    res.status(500).json({ error: 'falha de autenticação' });
  }
}

/** Middleware: só admins */
export function adminOnly(req, res, next) {
  if (req.agente?.role !== 'admin') return res.status(403).json({ error: 'apenas admin' });
  next();
}

/* ── POST /login ────────────────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    const login = (req.body?.login || '').trim();
    const senha = (req.body?.senha || '').trim();
    if (!login || !senha) {
      audit(req, 'login_payload_invalido');
      return res.status(400).json({ error: 'login e senha obrigatórios' });
    }

    const { rows } = await query(
      `SELECT id, nome, login, senha_hash, role, avatar_url, ativo
       FROM agentes WHERE LOWER(login) = LOWER($1) LIMIT 1`,
      [login]
    );
    const a = rows[0];

    // Roda bcrypt SEMPRE, mesmo se user não existe — anti-timing-attack.
    const hashParaComparar = a?.senha_hash || (await getDummyHash());
    const ok = await bcrypt.compare(senha, hashParaComparar);

    if (!a || !a.ativo || !ok) {
      audit(req, 'login_falha', null, { login_tentado: login });
      return res.status(401).json({ error: 'credenciais inválidas' });
    }

    const token  = crypto.randomBytes(28).toString('base64url');
    const expira = new Date(Date.now() + AUTH.ttl_dias * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO agente_sessoes(token, agente_id, expira_em, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [token, a.id, expira, req.header('user-agent') || null]
    );

    // Housekeeping: limita sessões ativas + remove expiradas (fire-and-forget)
    query(
      `DELETE FROM agente_sessoes
       WHERE agente_id = $1
         AND (expira_em < NOW()
              OR token NOT IN (
                SELECT token FROM agente_sessoes
                WHERE agente_id = $1 AND expira_em > NOW()
                ORDER BY ultimo_uso DESC NULLS LAST, criado_em DESC
                LIMIT $2
              ))`,
      [a.id, AUTH.max_sessoes]
    ).catch(e => log.warn('[auth] housekeeping:', e.message));

    audit({ ...req, agente: { agente_id: a.id } }, 'login_ok', `agente:${a.id}`, { role: a.role });

    res.json({
      ok: true, token,
      id: a.id, nome: a.nome, role: a.role,
      avatar_url: a.avatar_url || null,
    });
  } catch (e) {
    log.error('[auth/login]', e);
    res.status(500).json({ error: 'erro interno' });
  }
});

/* ── POST /logout ──────────────────────────────────────────────────────── */
router.post('/logout', authMw, async (req, res) => {
  try {
    await query(`DELETE FROM agente_sessoes WHERE token = $1`, [req.header('x-admin-token')]);
    audit(req, 'logout', `agente:${req.agente.agente_id}`);
  } catch {}
  res.json({ ok: true });
});

/* ── GET /me ───────────────────────────────────────────────────────────── */
router.get('/me', authMw, (req, res) => {
  res.json({
    id:         req.agente.agente_id,
    nome:       req.agente.nome,
    login:      req.agente.login,
    role:       req.agente.role,
    avatar_url: req.agente.avatar_url,
  });
});

/* ── PUT /me/senha — troca de senha ────────────────────────────────────── */
router.put('/me/senha', authMw, async (req, res) => {
  try {
    const { senha_atual, senha_nova } = req.body || {};
    if (!senha_atual || !senha_nova)
      return res.status(400).json({ error: 'senha_atual e senha_nova obrigatórias' });
    if (senha_nova.length < 8)
      return res.status(400).json({ error: 'senha mínima 8 caracteres' });
    if (!/[A-Za-z]/.test(senha_nova) || !/[0-9]/.test(senha_nova))
      return res.status(400).json({ error: 'senha deve conter letras e números' });

    const { rows } = await query(`SELECT senha_hash FROM agentes WHERE id = $1`,
      [req.agente.agente_id]);
    const ok = await bcrypt.compare(senha_atual, rows[0].senha_hash);
    if (!ok) {
      audit(req, 'senha_trocada_falha', `agente:${req.agente.agente_id}`);
      return res.status(401).json({ error: 'senha atual incorreta' });
    }

    const hash = await bcrypt.hash(senha_nova, AUTH.bcrypt_rounds);
    await query(`UPDATE agentes SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2`,
      [hash, req.agente.agente_id]);

    // Invalida outras sessões deste agente (mantém só a atual)
    await query(`DELETE FROM agente_sessoes WHERE agente_id = $1 AND token <> $2`,
      [req.agente.agente_id, req.header('x-admin-token')]);

    audit(req, 'senha_trocada_ok', `agente:${req.agente.agente_id}`);
    res.json({ ok: true });
  } catch (e) {
    log.error('[auth/senha]', e);
    res.status(500).json({ error: 'erro ao trocar senha' });
  }
});

export default router;
