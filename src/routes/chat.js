/**
 * Pinheiro OS — Chat interno (comunicação oficial entre funcionários).
 * Montado em /api/chat/*
 *
 * Estrutura única cobre DM (1:1), grupos e o canal de avisos (só admin posta).
 * Tempo real via SSE (services/realtime.js); push p/ destinatários offline.
 *
 * Padrões herdados de os.js: paginação {items,total,limit,offset}, withTx,
 * SQL parametrizado, audit(). Sempre req.agente.agente_id (não existe .id).
 *
 * Rota de mídia (GET /media/:id) é registrada ANTES do authMw global porque
 * <img>/<audio>/<video> não enviam o header x-admin-token — a autorização é
 * feita por URL assinada (HMAC + expiração), emitida só a participantes.
 */
import { Router }  from 'express';
import crypto      from 'node:crypto';
import { statSync, createReadStream, unlink } from 'node:fs';
import { query, withTx } from '../services/db.js';
import { authMw }  from './auth.js';
import { audit }   from '../services/audit.js';
import { log }     from '../services/logger.js';
import { PAGINATION } from '../services/constants.js';
import { uploadAnexo, toRelativo, toAbsoluto, LIMITES, mimeCompativel } from '../services/storage.js';
import { emitToAgentes, isOnline } from '../services/realtime.js';
import { sendPush } from '../services/push.js';

const router = Router();

/* ── Segredo p/ assinar URLs de mídia ───────────────────────────────────── */
const APP_SECRET = process.env.APP_SECRET || process.env.VAPID_PRIVATE_KEY || null;
const _mediaSecret = APP_SECRET || crypto.randomBytes(32).toString('hex');
if (!APP_SECRET) {
  log.warn('[chat] APP_SECRET ausente — URLs de mídia usam segredo efêmero (invalidam no restart). Defina APP_SECRET no deploy.');
}
const MEDIA_TTL_MS = 6 * 60 * 60 * 1000;

function signMediaUrl(anexoId) {
  const exp = Date.now() + MEDIA_TTL_MS;
  const sig = crypto.createHmac('sha256', _mediaSecret).update(`${anexoId}|${exp}`).digest('base64url');
  return `/api/chat/media/${anexoId}?exp=${exp}&sig=${sig}`;
}
function verifyMediaSig(anexoId, exp, sig) {
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const esperado = crypto.createHmac('sha256', _mediaSecret).update(`${anexoId}|${exp}`).digest('base64url');
  try {
    const a = Buffer.from(sig), b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/* ══ GET /media/:id — download/stream com Range (SEM authMw: URL assinada) ══ */
router.get('/media/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!id || !verifyMediaSig(id, req.query.exp, req.query.sig)) {
      return res.status(403).json({ error: 'acesso negado' });
    }
    const { rows } = await query(
      `SELECT path, mime, tamanho_b FROM chat_anexos WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'anexo não encontrado' });

    const abs = toAbsoluto(rows[0].path);
    const stat = statSync(abs);
    const total = stat.size;
    const mime = rows[0].mime || 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=86400');

    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end   = m && m[2] ? parseInt(m[2], 10) : total - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= total) end = total - 1;
      if (start > end) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      createReadStream(abs, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', total);
      createReadStream(abs).pipe(res);
    }
  } catch (e) {
    log.error('[chat/media]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'erro ao servir mídia' });
  }
});

/* ══ A partir daqui, tudo exige autenticação ════════════════════════════ */
router.use(authMw);

/* ── Helpers ────────────────────────────────────────────────────────────── */
function parsePagination(req) {
  const limit  = Math.min(PAGINATION.max, Math.max(1, +req.query.limit  || PAGINATION.default));
  const offset = Math.max(0, +req.query.offset || 0);
  return { limit, offset };
}

async function getParticipacao(conversaId, agenteId) {
  const { rows } = await query(
    `SELECT papel, notif_mudo, ultima_msg_lida_id FROM chat_participantes
     WHERE conversa_id = $1 AND agente_id = $2 AND saiu_em IS NULL`,
    [conversaId, agenteId]);
  return rows[0] || null;
}

async function getConversa(conversaId) {
  const { rows } = await query(`SELECT * FROM chat_conversas WHERE id = $1`, [conversaId]);
  return rows[0] || null;
}

async function participantesAtivos(conversaId) {
  const { rows } = await query(
    `SELECT agente_id, notif_mudo FROM chat_participantes
     WHERE conversa_id = $1 AND saiu_em IS NULL`, [conversaId]);
  return rows;
}

function anexoParaCliente(a) {
  return {
    id: a.id, tipo: a.tipo, mime: a.mime, tamanho_b: a.tamanho_b,
    largura: a.largura, altura: a.altura, duracao_s: a.duracao_s,
    lat: a.lat, lng: a.lng, nome_original: a.nome_original,
    url: signMediaUrl(a.id),
  };
}

/** Carrega uma mensagem já no formato do cliente (autor + anexos + url assinada). */
async function carregarMensagem(msgId) {
  const { rows } = await query(
    `SELECT m.*, a.nome AS autor_nome, a.avatar_url AS autor_avatar
     FROM chat_mensagens m LEFT JOIN agentes a ON a.id = m.autor_id
     WHERE m.id = $1`, [msgId]);
  if (!rows.length) return null;
  const m = rows[0];
  const { rows: anexos } = await query(
    `SELECT * FROM chat_anexos WHERE mensagem_id = $1 ORDER BY id`, [msgId]);
  return {
    id: m.id, conversa_id: m.conversa_id, autor_id: m.autor_id,
    autor_nome: m.autor_nome, autor_avatar: m.autor_avatar,
    tipo: m.tipo, texto: m.texto, responde_a: m.responde_a, os_id: m.os_id,
    editado_em: m.editado_em, deletado_em: m.deletado_em, criado_em: m.criado_em,
    anexos: anexos.map(anexoParaCliente),
  };
}

/**
 * Distribui uma mensagem nova: SSE p/ participantes online + push p/ offline.
 */
async function distribuirMensagem(conversa, msgCliente, autorId) {
  const parts = await participantesAtivos(conversa.id);
  const ids = parts.map(p => p.agente_id);
  emitToAgentes(ids, 'nova_mensagem', { conversa_id: conversa.id, mensagem: msgCliente });

  const previa = msgCliente.tipo === 'texto'
    ? (msgCliente.texto || '')
    : ({ foto:'📷 Foto', audio:'🎤 Áudio', video:'🎬 Vídeo', arquivo:'📎 Arquivo', os_ref:'🔧 OS' }[msgCliente.tipo] || 'Mensagem');
  const titulo = conversa.tipo === 'dm'
    ? (msgCliente.autor_nome || 'Nova mensagem')
    : `${conversa.titulo || 'Conversa'} · ${msgCliente.autor_nome || ''}`.trim();

  for (const p of parts) {
    if (p.agente_id === autorId) continue;
    if (p.notif_mudo) continue;
    if (isOnline(p.agente_id)) continue;   // SSE já cobre quem está com o app aberto
    sendPush(p.agente_id, {
      title: titulo,
      body: previa.slice(0, 140),
      tag: `conv-${conversa.id}`,
      url: `/?conv=${conversa.id}`,
    }).catch(() => {});
  }
}

/* ── GET /conversas — minhas conversas ──────────────────────────────────── */
router.get('/conversas', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const { limit, offset } = parsePagination(req);

    const [totalR, listaR] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM chat_participantes
             WHERE agente_id = $1 AND saiu_em IS NULL`, [me]),
      query(
        `SELECT c.id, c.tipo, c.titulo, c.descricao, c.avatar_url,
                c.somente_admin_posta, c.ultima_mensagem_em,
                p.ultima_msg_lida_id, p.notif_mudo, p.papel,
                (SELECT COUNT(*) FROM chat_mensagens m
                  WHERE m.conversa_id = c.id
                    AND m.id > p.ultima_msg_lida_id
                    AND m.deletado_em IS NULL
                    AND m.autor_id IS DISTINCT FROM $1)::int AS unread,
                lm.id AS ultima_id, lm.tipo AS ultima_tipo, lm.texto AS ultima_texto,
                lm.autor_id AS ultima_autor_id, la.nome AS ultima_autor_nome
         FROM chat_participantes p
         JOIN chat_conversas c ON c.id = p.conversa_id
         LEFT JOIN LATERAL (
           SELECT id, tipo, texto, autor_id FROM chat_mensagens
           WHERE conversa_id = c.id AND deletado_em IS NULL
           ORDER BY id DESC LIMIT 1
         ) lm ON true
         LEFT JOIN agentes la ON la.id = lm.autor_id
         WHERE p.agente_id = $1 AND p.saiu_em IS NULL
         ORDER BY c.ultima_mensagem_em DESC NULLS LAST, c.id DESC
         LIMIT $2 OFFSET $3`,
        [me, limit, offset]
      ),
    ]);

    const items = listaR.rows;

    // Deriva título/avatar/presença do "outro" nas DMs
    const dmIds = items.filter(c => c.tipo === 'dm').map(c => c.id);
    if (dmIds.length) {
      const { rows: outros } = await query(
        `SELECT p.conversa_id, a.id AS agente_id, a.nome, a.avatar_url, a.ultimo_visto
         FROM chat_participantes p JOIN agentes a ON a.id = p.agente_id
         WHERE p.conversa_id = ANY($1::bigint[]) AND p.agente_id <> $2`,
        [dmIds, me]);
      const byConv = new Map(outros.map(o => [String(o.conversa_id), o]));
      for (const c of items) {
        if (c.tipo !== 'dm') continue;
        const o = byConv.get(String(c.id));
        if (o) {
          c.titulo = o.nome;
          c.avatar_url = o.avatar_url;
          c.outro_id = o.agente_id;
          c.online = isOnline(o.agente_id);
          c.ultimo_visto = o.ultimo_visto;
        }
      }
    }

    res.json({ items, total: totalR.rows[0].total, limit, offset });
  } catch (e) {
    log.error('[chat/conversas]', e.message);
    res.status(500).json({ error: 'erro ao listar conversas' });
  }
});

/* ── GET /agentes — agentes ativos p/ iniciar DM / montar grupo ─────────── */
router.get('/agentes', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const { rows } = await query(
      `SELECT id, nome, login, role, avatar_url, ultimo_visto
       FROM agentes WHERE ativo = true AND id <> $1 ORDER BY nome`, [me]);
    res.json({ items: rows.map(a => ({ ...a, online: isOnline(a.id) })) });
  } catch (e) {
    log.error('[chat/agentes]', e.message);
    res.status(500).json({ error: 'erro ao listar agentes' });
  }
});

/* ── POST /dm — get-or-create conversa 1:1 ──────────────────────────────── */
router.post('/dm', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const outro = +req.body?.agente_id;
    if (!outro || outro === me) return res.status(400).json({ error: 'agente_id inválido' });

    const { rows: existe } = await query(`SELECT id FROM agentes WHERE id = $1 AND ativo = true`, [outro]);
    if (!existe.length) return res.status(404).json({ error: 'agente não encontrado' });

    const [a, b] = me < outro ? [me, outro] : [outro, me];
    const dmKey = `${a}:${b}`;

    const conversaId = await withTx(async c => {
      const ins = await c.query(
        `INSERT INTO chat_conversas (tipo, dm_key, criado_por)
         VALUES ('dm', $1, $2)
         ON CONFLICT (dm_key) DO NOTHING
         RETURNING id`, [dmKey, me]);
      let cid;
      if (ins.rows.length) {
        cid = ins.rows[0].id;
        await c.query(
          `INSERT INTO chat_participantes (conversa_id, agente_id) VALUES ($1,$2),($1,$3)`,
          [cid, a, b]);
      } else {
        const sel = await c.query(`SELECT id FROM chat_conversas WHERE dm_key = $1`, [dmKey]);
        cid = sel.rows[0].id;
      }
      return cid;
    });

    res.status(201).json({ id: conversaId, tipo: 'dm' });
  } catch (e) {
    log.error('[chat/dm]', e.message);
    res.status(500).json({ error: 'erro ao abrir conversa' });
  }
});

/* ── POST /conversas — criar grupo ou canal ─────────────────────────────── */
router.post('/conversas', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const { tipo, titulo, descricao } = req.body || {};
    if (!['grupo', 'canal'].includes(tipo)) return res.status(400).json({ error: 'tipo deve ser grupo ou canal' });
    if (!titulo?.trim()) return res.status(400).json({ error: 'titulo obrigatório' });
    if (tipo === 'canal' && req.agente.role !== 'admin') {
      return res.status(403).json({ error: 'apenas admin cria canal de avisos' });
    }

    const conversaId = await withTx(async c => {
      const ins = await c.query(
        `INSERT INTO chat_conversas (tipo, titulo, descricao, somente_admin_posta, criado_por)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tipo, titulo.trim(), descricao || null, tipo === 'canal', me]);
      const cid = ins.rows[0].id;

      if (tipo === 'canal') {
        // Canal de avisos: todos os agentes ativos entram; criador é admin
        await c.query(
          `INSERT INTO chat_participantes (conversa_id, agente_id, papel)
           SELECT $1, id, CASE WHEN id = $2 THEN 'admin' ELSE 'membro' END
           FROM agentes WHERE ativo = true`, [cid, me]);
      } else {
        const ids = Array.isArray(req.body?.participantes) ? req.body.participantes.map(Number).filter(Boolean) : [];
        const membros = new Set([me, ...ids]);
        for (const aid of membros) {
          await c.query(
            `INSERT INTO chat_participantes (conversa_id, agente_id, papel)
             VALUES ($1, $2, $3)
             ON CONFLICT (conversa_id, agente_id) DO NOTHING`,
            [cid, aid, aid === me ? 'admin' : 'membro']);
        }
      }
      return cid;
    });

    audit(req, 'chat_conversa_criada', `conversa:${conversaId}`, { tipo });
    res.status(201).json({ id: conversaId, tipo });
  } catch (e) {
    log.error('[chat/conversas/criar]', e.message);
    res.status(500).json({ error: 'erro ao criar conversa' });
  }
});

/* ── GET /conversas/:id — detalhe + participantes ───────────────────────── */
router.get('/conversas/:id', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const part = await getParticipacao(id, me);
    if (!part) return res.status(403).json({ error: 'você não participa desta conversa' });

    const conversa = await getConversa(id);
    const { rows: participantes } = await query(
      `SELECT a.id, a.nome, a.avatar_url, a.role, a.ultimo_visto, p.papel
       FROM chat_participantes p JOIN agentes a ON a.id = p.agente_id
       WHERE p.conversa_id = $1 AND p.saiu_em IS NULL ORDER BY a.nome`, [id]);

    const out = { ...conversa, meu_papel: part.papel, participantes: participantes.map(p => ({ ...p, online: isOnline(p.id) })) };
    if (conversa.tipo === 'dm') {
      const o = participantes.find(p => p.id !== me);
      if (o) { out.titulo = o.nome; out.avatar_url = o.avatar_url; out.outro_id = o.id; out.online = isOnline(o.id); out.ultimo_visto = o.ultimo_visto; }
    }
    res.json(out);
  } catch (e) {
    log.error('[chat/conversa/detalhe]', e.message);
    res.status(500).json({ error: 'erro ao carregar conversa' });
  }
});

/* ── GET /conversas/:id/mensagens?before&limit ──────────────────────────── */
router.get('/conversas/:id/mensagens', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const part = await getParticipacao(id, me);
    if (!part) return res.status(403).json({ error: 'você não participa desta conversa' });

    const limit  = Math.min(100, Math.max(1, +req.query.limit || 40));
    const before = req.query.before ? +req.query.before : null;

    const { rows } = await query(
      `SELECT m.*, a.nome AS autor_nome, a.avatar_url AS autor_avatar
       FROM chat_mensagens m LEFT JOIN agentes a ON a.id = m.autor_id
       WHERE m.conversa_id = $1 AND ($2::bigint IS NULL OR m.id < $2)
       ORDER BY m.id DESC LIMIT $3`,
      [id, before, limit]);

    const msgIds = rows.map(r => r.id);
    let anexosPorMsg = new Map();
    if (msgIds.length) {
      const { rows: anexos } = await query(
        `SELECT * FROM chat_anexos WHERE mensagem_id = ANY($1::bigint[]) ORDER BY id`, [msgIds]);
      for (const a of anexos) {
        const arr = anexosPorMsg.get(String(a.mensagem_id)) || [];
        arr.push(anexoParaCliente(a));
        anexosPorMsg.set(String(a.mensagem_id), arr);
      }
    }

    // Menor ultima_msg_lida_id entre os OUTROS participantes → base do ✓✓
    const { rows: minR } = await query(
      `SELECT COALESCE(MIN(ultima_msg_lida_id), 0)::bigint AS min_lida
       FROM chat_participantes WHERE conversa_id = $1 AND agente_id <> $2 AND saiu_em IS NULL`,
      [id, me]);
    const minLidaOutros = Number(minR[0].min_lida);

    const items = rows.reverse().map(m => ({
      id: m.id, conversa_id: m.conversa_id, autor_id: m.autor_id,
      autor_nome: m.autor_nome, autor_avatar: m.autor_avatar,
      tipo: m.tipo, texto: m.texto, responde_a: m.responde_a, os_id: m.os_id,
      editado_em: m.editado_em, deletado_em: m.deletado_em, criado_em: m.criado_em,
      anexos: anexosPorMsg.get(String(m.id)) || [],
    }));

    res.json({ items, min_lida_outros: minLidaOutros, tem_mais: rows.length === limit });
  } catch (e) {
    log.error('[chat/mensagens]', e.message);
    res.status(500).json({ error: 'erro ao carregar mensagens' });
  }
});

/* ── POST /conversas/:id/mensagens — enviar texto ───────────────────────── */
router.post('/conversas/:id/mensagens', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const { texto, responde_a, os_id } = req.body || {};
    if (!texto?.trim()) return res.status(400).json({ error: 'texto vazio' });
    if (texto.length > 8000) return res.status(400).json({ error: 'texto muito longo' });

    const part = await getParticipacao(id, me);
    if (!part) return res.status(403).json({ error: 'você não participa desta conversa' });
    const conversa = await getConversa(id);
    if (conversa.somente_admin_posta && req.agente.role !== 'admin') {
      return res.status(403).json({ error: 'apenas admin pode postar neste canal' });
    }

    const msgId = await withTx(async c => {
      const ins = await c.query(
        `INSERT INTO chat_mensagens (conversa_id, autor_id, tipo, texto, responde_a, os_id)
         VALUES ($1, $2, 'texto', $3, $4, $5) RETURNING id`,
        [id, me, texto.trim(), responde_a || null, os_id || null]);
      await c.query(`UPDATE chat_conversas SET ultima_mensagem_em = NOW(), atualizado_em = NOW() WHERE id = $1`, [id]);
      // Autor "leu" a própria mensagem
      await c.query(
        `UPDATE chat_participantes SET ultima_msg_lida_id = $1, ultima_leitura_em = NOW()
         WHERE conversa_id = $2 AND agente_id = $3`, [ins.rows[0].id, id, me]);
      return ins.rows[0].id;
    });

    const msg = await carregarMensagem(msgId);
    distribuirMensagem(conversa, msg, me).catch(e => log.warn('[chat] distribuir:', e.message));
    audit(req, 'chat_msg', `conversa:${id}`, { tipo: 'texto' });
    res.status(201).json(msg);
  } catch (e) {
    log.error('[chat/enviar]', e.message);
    res.status(500).json({ error: 'erro ao enviar mensagem' });
  }
});

/* ── POST /conversas/:id/anexos — enviar mídia (foto/áudio; vídeo FASE 2) ── */
router.post('/conversas/:id/anexos', (req, res) => {
  uploadAnexo(req, res, async (err) => {
    // Remove o arquivo já gravado pelo multer quando a requisição é rejeitada
    // (o diskStorage grava ANTES do handler rodar as validações/autorização).
    const limpar = () => { if (req.file?.path) unlink(req.file.path, () => {}); };
    const rejeitar = (status, error) => { limpar(); return res.status(status).json({ error }); };
    try {
      if (err) return rejeitar(400, err.message);
      if (!req.file) return res.status(400).json({ error: 'arquivo ausente' });

      const me = req.agente.agente_id;
      const id = +req.params.id;
      const tipo = String(req.body?.tipo || 'arquivo');
      if (!id) return rejeitar(400, 'id inválido');
      if (!['foto', 'audio', 'video', 'arquivo'].includes(tipo)) {
        return rejeitar(400, 'tipo inválido');
      }
      // MIME validado aqui (não no fileFilter) pois req.body.tipo já está parseado.
      if (!mimeCompativel(tipo, req.file.mimetype)) {
        return rejeitar(400, `arquivo '${req.file.mimetype}' incompatível com tipo '${tipo}'`);
      }
      // Refino de limite por tipo (o teto geral do multer é o de vídeo)
      if (LIMITES[tipo] && req.file.size > LIMITES[tipo]) {
        return rejeitar(400, `arquivo excede o limite de ${Math.round(LIMITES[tipo] / 1048576)}MB`);
      }

      const part = await getParticipacao(id, me);
      if (!part) return rejeitar(403, 'você não participa desta conversa');
      const conversa = await getConversa(id);
      if (conversa.somente_admin_posta && req.agente.role !== 'admin') {
        return rejeitar(403, 'apenas admin pode postar neste canal');
      }

      const rel = toRelativo(req.file.path);
      const lat = req.body?.lat != null && req.body.lat !== '' ? +req.body.lat : null;
      const lng = req.body?.lng != null && req.body.lng !== '' ? +req.body.lng : null;
      const dur = req.body?.duracao_s != null && req.body.duracao_s !== '' ? +req.body.duracao_s : null;
      const legenda = req.body?.texto?.trim() || null;

      const msgId = await withTx(async c => {
        const ins = await c.query(
          `INSERT INTO chat_mensagens (conversa_id, autor_id, tipo, texto)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [id, me, tipo, legenda]);
        const mid = ins.rows[0].id;
        await c.query(
          `INSERT INTO chat_anexos (mensagem_id, tipo, path, nome_original, mime, tamanho_b, duracao_s, lat, lng)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [mid, tipo, rel, req.file.originalname || null, req.file.mimetype || null,
           req.file.size, dur, lat, lng]);
        await c.query(`UPDATE chat_conversas SET ultima_mensagem_em = NOW(), atualizado_em = NOW() WHERE id = $1`, [id]);
        await c.query(
          `UPDATE chat_participantes SET ultima_msg_lida_id = $1, ultima_leitura_em = NOW()
           WHERE conversa_id = $2 AND agente_id = $3`, [mid, id, me]);
        return mid;
      });

      const msg = await carregarMensagem(msgId);
      distribuirMensagem(conversa, msg, me).catch(e => log.warn('[chat] distribuir:', e.message));
      audit(req, 'chat_anexo', `conversa:${id}`, { tipo, bytes: req.file.size });
      res.status(201).json(msg);
    } catch (e) {
      limpar();
      log.error('[chat/anexo]', e.message);
      res.status(500).json({ error: 'erro ao enviar anexo' });
    }
  });
});

/* ── POST /conversas/:id/ler — marca lido até uma mensagem ──────────────── */
router.post('/conversas/:id/ler', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const id = +req.params.id;
    const ate = +req.body?.ate_msg_id;
    if (!id) return res.status(400).json({ error: 'id inválido' });
    if (!ate) return res.status(400).json({ error: 'ate_msg_id obrigatório' });

    const part = await getParticipacao(id, me);
    if (!part) return res.status(403).json({ error: 'você não participa desta conversa' });

    await query(
      `UPDATE chat_participantes
       SET ultima_msg_lida_id = GREATEST(ultima_msg_lida_id, $1), ultima_leitura_em = NOW()
       WHERE conversa_id = $2 AND agente_id = $3`, [ate, id, me]);

    const conversa = await getConversa(id);
    // Canal de avisos: recibo explícito por mensagem (auditável "quem leu")
    if (conversa?.somente_admin_posta) {
      await query(
        `INSERT INTO chat_recibos (mensagem_id, agente_id, estado, lido_em)
         SELECT m.id, $1, 'lido', NOW() FROM chat_mensagens m
         WHERE m.conversa_id = $2 AND m.id <= $3 AND m.autor_id IS DISTINCT FROM $1
         ON CONFLICT (mensagem_id, agente_id)
         DO UPDATE SET estado = 'lido', lido_em = NOW()`,
        [me, id, ate]);
    }

    // Avisa os demais (autores) p/ atualizar ✓✓
    const parts = await participantesAtivos(id);
    emitToAgentes(parts.map(p => p.agente_id).filter(a => a !== me),
      'status_mensagem', { conversa_id: id, ate_msg_id: ate, por: me });

    res.json({ ok: true });
  } catch (e) {
    log.error('[chat/ler]', e.message);
    res.status(500).json({ error: 'erro ao marcar leitura' });
  }
});

/* ── GET /conversas/:id/mensagens/:msgId/recibos — "quem leu" (avisos) ──── */
router.get('/conversas/:id/mensagens/:msgId/recibos', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const id = +req.params.id;
    const msgId = +req.params.msgId;
    if (!id || !msgId) return res.status(400).json({ error: 'id inválido' });

    const part = await getParticipacao(id, me);
    if (!part) return res.status(403).json({ error: 'sem acesso' });
    // Só admin/autor vê a lista de leitura
    const { rows: mr } = await query(`SELECT autor_id FROM chat_mensagens WHERE id = $1 AND conversa_id = $2`, [msgId, id]);
    if (!mr.length) return res.status(404).json({ error: 'mensagem não encontrada' });
    if (req.agente.role !== 'admin' && mr[0].autor_id !== me) {
      return res.status(403).json({ error: 'apenas admin/autor' });
    }

    const { rows: lidos } = await query(
      `SELECT a.id, a.nome, a.avatar_url, r.lido_em
       FROM chat_recibos r JOIN agentes a ON a.id = r.agente_id
       WHERE r.mensagem_id = $1 AND r.estado = 'lido' ORDER BY r.lido_em`, [msgId]);
    const lidosIds = lidos.map(l => l.id);
    const { rows: pendentes } = await query(
      `SELECT a.id, a.nome, a.avatar_url
       FROM chat_participantes p JOIN agentes a ON a.id = p.agente_id
       WHERE p.conversa_id = $1 AND p.saiu_em IS NULL
         AND a.id <> $2 AND NOT (a.id = ANY($3::int[]))
       ORDER BY a.nome`,
      [id, mr[0].autor_id, lidosIds.length ? lidosIds : [0]]);

    res.json({ lidos, pendentes });
  } catch (e) {
    log.error('[chat/recibos]', e.message);
    res.status(500).json({ error: 'erro ao carregar recibos' });
  }
});

/* ── PUT /conversas/:id/mudo — silenciar/reativar notificações ──────────── */
router.put('/conversas/:id/mudo', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const mudo = !!req.body?.mudo;
    const { rowCount } = await query(
      `UPDATE chat_participantes SET notif_mudo = $1
       WHERE conversa_id = $2 AND agente_id = $3 AND saiu_em IS NULL`, [mudo, id, me]);
    if (!rowCount) return res.status(403).json({ error: 'você não participa desta conversa' });
    res.json({ ok: true, mudo });
  } catch (e) {
    log.error('[chat/mudo]', e.message);
    res.status(500).json({ error: 'erro ao atualizar' });
  }
});

/* ── GET /stats — KPI do perfil ("Conversas 7d") ────────────────────────── */
router.get('/stats', async (req, res) => {
  try {
    const me = req.agente.agente_id;
    const { rows } = await query(
      `SELECT COUNT(DISTINCT m.conversa_id)::int AS conv_7d
       FROM chat_mensagens m
       JOIN chat_participantes p ON p.conversa_id = m.conversa_id AND p.agente_id = $1
       WHERE m.criado_em > NOW() - INTERVAL '7 days'`, [me]);
    res.json({ conversas_7d: rows[0].conv_7d });
  } catch (e) {
    log.error('[chat/stats]', e.message);
    res.status(500).json({ error: 'erro' });
  }
});

/* ── PUT /perfil/assinatura — assinatura nas mensagens ──────────────────── */
router.put('/perfil/assinatura', async (req, res) => {
  try {
    const assinatura = (req.body?.assinatura || '').slice(0, 120) || null;
    await query(`UPDATE agentes SET assinatura_chat = $1 WHERE id = $2`,
      [assinatura, req.agente.agente_id]);
    res.json({ ok: true, assinatura });
  } catch (e) {
    log.error('[chat/assinatura]', e.message);
    res.status(500).json({ error: 'erro ao salvar assinatura' });
  }
});

export default router;
