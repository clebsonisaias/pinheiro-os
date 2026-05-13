/**
 * Pinheiro OS — Rotas de autenticação dos agentes.
 *
 * Montado em /ondaos/api/agentes/*
 *
 * Token strategy: random 28 bytes em base64url, gravado em `agente_sessoes`,
 * TTL 30 dias, renovado a cada uso. Header: x-admin-token (mesmo nome do Maxxi
 * para o frontend reaproveitar a função api() do shared.js).
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query } from '../services/db.js';

const router = Router();

const TTL_DIAS = 30;

/** Middleware: lê x-admin-token, valida sessão, popula req.agente */
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
    if (!rows.length) return res.status(401).json({ error: 'sessão expirada' });
    if (!rows[0].ativo) return res.status(403).json({ error: 'agente inativo' });

    req.agente = rows[0];

    // Atualiza ultimo_uso async, não bloqueia request
    query(`UPDATE agente_sessoes SET ultimo_uso = NOW() WHERE token = $1`, [token])
      .catch(() => {});

    next();
  } catch (e) {
    console.error('[ondaos/auth]', e.message);
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
    if (!login || !senha) return res.status(400).json({ error: 'login e senha obrigatórios' });

    const { rows } = await query(
      `SELECT id, nome, login, senha_hash, role, avatar_url, ativo
       FROM agentes WHERE LOWER(login) = LOWER($1) LIMIT 1`,
      [login]
    );
    const a = rows[0];
    if (!a || !a.ativo) return res.status(401).json({ error: 'credenciais inválidas' });

    const ok = await bcrypt.compare(senha, a.senha_hash);
    if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });

    const token  = crypto.randomBytes(28).toString('base64url');
    const expira = new Date(Date.now() + TTL_DIAS * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO agente_sessoes(token, agente_id, expira_em, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [token, a.id, expira, req.header('user-agent') || null]
    );

    // Limpa sessões expiradas deste mesmo agente (housekeeping leve)
    query(`DELETE FROM agente_sessoes WHERE agente_id = $1 AND expira_em < NOW()`, [a.id])
      .catch(() => {});

    res.json({
      ok: true, token,
      id: a.id, nome: a.nome, role: a.role,
      avatar: a.avatar_url ? null : (a.nome || 'A')[0].toUpperCase(),
      avatar_url: a.avatar_url || null,
    });
  } catch (e) {
    console.error('[ondaos/login]', e);
    res.status(500).json({ error: 'erro interno' });
  }
});

/* ── POST /logout ──────────────────────────────────────────────────────── */
router.post('/logout', authMw, async (req, res) => {
  try {
    await query(`DELETE FROM agente_sessoes WHERE token = $1`, [req.header('x-admin-token')]);
  } catch {}
  res.json({ ok: true });
});

/* ── GET /me ───────────────────────────────────────────────────────────── */
router.get('/me', authMw, (req, res) => {
  res.json({
    id:        req.agente.agente_id,
    nome:      req.agente.nome,
    login:     req.agente.login,
    role:      req.agente.role,
    avatar_url: req.agente.avatar_url,
  });
});

/* ── PUT /me/senha — troca de senha ────────────────────────────────────── */
router.put('/me/senha', authMw, async (req, res) => {
  try {
    const { senha_atual, senha_nova } = req.body || {};
    if (!senha_atual || !senha_nova) return res.status(400).json({ error: 'senha_atual e senha_nova obrigatórias' });
    if (senha_nova.length < 8)         return res.status(400).json({ error: 'senha mínima 8 caracteres' });
    if (!/[A-Za-z]/.test(senha_nova) || !/[0-9]/.test(senha_nova))
      return res.status(400).json({ error: 'senha deve conter letras e números' });

    const { rows } = await query(`SELECT senha_hash FROM agentes WHERE id = $1`, [req.agente.agente_id]);
    const ok = await bcrypt.compare(senha_atual, rows[0].senha_hash);
    if (!ok) return res.status(401).json({ error: 'senha atual incorreta' });

    const hash = await bcrypt.hash(senha_nova, 10);
    await query(`UPDATE agentes SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2`,
      [hash, req.agente.agente_id]);

    // Invalida outras sessões deste agente
    await query(`DELETE FROM agente_sessoes WHERE agente_id = $1 AND token <> $2`,
      [req.agente.agente_id, req.header('x-admin-token')]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
