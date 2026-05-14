/**
 * Pinheiro OS — Rotas das Ordens de Serviço.
 * Montado em /api/os/*
 *
 * Endpoints com paginação (?limit=&offset=) retornam:
 *   { items: [...], total: N, limit, offset }
 * Mutações grava evento em os_eventos + audit_log.
 */
import { Router }       from 'express';
import { query, withTx } from '../services/db.js';
import { authMw }       from './auth.js';
import { audit }        from '../services/audit.js';
import { log }          from '../services/logger.js';
import { OS_STATUS, PAGINATION } from '../services/constants.js';

const router = Router();
router.use(authMw);

function parsePagination(req) {
  const limit  = Math.min(PAGINATION.max, Math.max(1, +req.query.limit  || PAGINATION.default));
  const offset = Math.max(0, +req.query.offset || 0);
  return { limit, offset };
}

/* ── GET /minhas — OS do agente logado ──────────────────────────────────── */
router.get('/minhas', async (req, res) => {
  try {
    const { status, dia } = req.query;
    const { limit, offset } = parsePagination(req);

    const cond = ['agente_id = $1'];
    const params = [req.agente.agente_id];

    if (status && OS_STATUS.includes(status)) {
      params.push(status); cond.push(`status = $${params.length}`);
    }
    if (dia === 'hoje') {
      cond.push(`(DATE(criada_em AT TIME ZONE 'America/Recife') = CURRENT_DATE
                  OR status NOT IN ('concluida','cancelada'))`);
    }

    const whereSql = cond.join(' AND ');

    // Total + página em paralelo
    const [totalR, itemsR] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM os WHERE ${whereSql}`, params),
      query(
        `SELECT id, fonte, fonte_id, tipo, status, prioridade,
                cliente_nome, cliente_doc, cliente_fone,
                endereco, bairro, cidade, lat, lng,
                sla, descricao, criada_em, atualizada_em, iniciada_em
         FROM os
         WHERE ${whereSql}
         ORDER BY sla NULLS LAST, prioridade DESC, criada_em ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
    ]);
    res.json({ items: itemsR.rows, total: totalR.rows[0].total, limit, offset });
  } catch (e) {
    log.error('[os/minhas]', e.message);
    res.status(500).json({ error: 'erro ao listar OS' });
  }
});

/* ── GET /fila — OS sem agente (para despachador) ───────────────────────── */
router.get('/fila', async (req, res) => {
  if (!['despachador','admin'].includes(req.agente.role)) {
    return res.status(403).json({ error: 'apenas despachador/admin' });
  }
  try {
    const { limit, offset } = parsePagination(req);
    const [totalR, itemsR] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM os
             WHERE agente_id IS NULL AND status NOT IN ('concluida','cancelada')`),
      query(
        `SELECT id, fonte, fonte_id, tipo, status, prioridade,
                cliente_nome, endereco, sla, lat, lng, criada_em
         FROM os
         WHERE agente_id IS NULL AND status NOT IN ('concluida','cancelada')
         ORDER BY sla NULLS LAST, prioridade DESC, criada_em ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ]);
    res.json({ items: itemsR.rows, total: totalR.rows[0].total, limit, offset });
  } catch (e) {
    log.error('[os/fila]', e.message);
    res.status(500).json({ error: 'erro ao listar fila' });
  }
});

/* ── GET /:id — detalhe completo ────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: 'id inválido' });

    const { rows } = await query(`SELECT * FROM os WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'OS não encontrada' });
    const os = rows[0];

    const [ev, ck, fo, ob] = await Promise.all([
      query(`SELECT * FROM os_eventos     WHERE os_id=$1 ORDER BY criado_em DESC LIMIT 80`, [id]),
      query(`SELECT * FROM os_checklist   WHERE os_id=$1 ORDER BY ordem ASC, id ASC`,        [id]),
      query(`SELECT * FROM os_fotos       WHERE os_id=$1 ORDER BY tirada_em DESC LIMIT 100`, [id]),
      query(`SELECT * FROM os_observacoes WHERE os_id=$1 ORDER BY criado_em DESC LIMIT 100`, [id]),
    ]);

    res.json({
      ...os,
      eventos:     ev.rows,
      checklist:   ck.rows,
      fotos:       fo.rows,
      observacoes: ob.rows,
    });
  } catch (e) {
    log.error('[os/get]', e.message);
    res.status(500).json({ error: 'erro ao buscar OS' });
  }
});

/* ── PUT /:id/status — muda status da OS + grava evento ─────────────────── */
router.put('/:id/status', async (req, res) => {
  try {
    const id = +req.params.id;
    const { status } = req.body || {};
    if (!OS_STATUS.includes(status)) return res.status(400).json({ error: 'status inválido' });

    const statusAnterior = await withTx(async c => {
      const { rows: cur } = await c.query(`SELECT status FROM os WHERE id = $1 FOR UPDATE`, [id]);
      if (!cur.length) throw new Error('OS não encontrada');
      const anterior = cur[0].status;

      const setIniciada = status === 'execucao'
        ? ', iniciada_em = COALESCE(iniciada_em, NOW())' : '';
      const setFechada  = ['concluida','cancelada'].includes(status)
        ? ', fechada_em = COALESCE(fechada_em, NOW())' : '';

      await c.query(
        `UPDATE os SET status = $1, atualizada_em = NOW() ${setIniciada} ${setFechada}
         WHERE id = $2`,
        [status, id]
      );
      await c.query(
        `INSERT INTO os_eventos(os_id, tipo, agente_id, dados)
         VALUES ($1, 'status_change', $2, $3)`,
        [id, req.agente.agente_id, JSON.stringify({ de: anterior, para: status })]
      );
      return anterior;
    });

    audit(req, 'os_status_change', `os:${id}`, { de: statusAnterior, para: status });
    res.json({ ok: true });
  } catch (e) {
    if (/não encontrada/.test(e.message)) return res.status(404).json({ error: e.message });
    log.error('[os/status]', e.message);
    res.status(500).json({ error: 'erro ao atualizar status' });
  }
});

/* ── POST /:id/observacao — adiciona texto (manual ou voz) ──────────────── */
router.post('/:id/observacao', async (req, res) => {
  try {
    const id = +req.params.id;
    const { texto, fonte = 'manual' } = req.body || {};
    if (!texto?.trim())  return res.status(400).json({ error: 'texto vazio' });
    if (!['manual','voz','sistema'].includes(fonte))
      return res.status(400).json({ error: 'fonte inválida' });
    if (texto.length > 10_000)
      return res.status(400).json({ error: 'texto muito longo (máx 10k chars)' });

    const { rows } = await query(
      `INSERT INTO os_observacoes(os_id, texto, fonte, agente_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, texto.trim(), fonte, req.agente.agente_id]
    );
    audit(req, 'os_observacao', `os:${id}`, { fonte, len: texto.length });
    res.json(rows[0]);
  } catch (e) {
    log.error('[os/observacao]', e.message);
    res.status(500).json({ error: 'erro ao gravar observação' });
  }
});

/* ── POST /:id/checklist/:itemId/toggle ─────────────────────────────────── */
router.post('/:id/checklist/:itemId/toggle', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE os_checklist
       SET feito    = NOT feito,
           feito_em = CASE WHEN NOT feito THEN NOW() ELSE NULL END,
           agente_id = $1
       WHERE id = $2 AND os_id = $3
       RETURNING *`,
      [req.agente.agente_id, +req.params.itemId, +req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'item não encontrado' });
    audit(req, 'os_checklist_toggle', `os:${req.params.id}`,
      { item_id: +req.params.itemId, feito: rows[0].feito });
    res.json(rows[0]);
  } catch (e) {
    log.error('[os/checklist]', e.message);
    res.status(500).json({ error: 'erro ao atualizar checklist' });
  }
});

/* ── POST / — criar OS local (não vinda de SGP/Maxxi) ───────────────────── */
router.post('/', async (req, res) => {
  try {
    const {
      tipo = 'outro', cliente_nome, cliente_doc, cliente_fone,
      endereco, bairro, cidade, lat, lng, sla, descricao, prioridade = 0,
    } = req.body || {};

    if (!cliente_nome?.trim()) return res.status(400).json({ error: 'cliente_nome obrigatório' });

    const { rows } = await query(
      `INSERT INTO os(fonte, tipo, prioridade, cliente_nome, cliente_doc, cliente_fone,
                      endereco, bairro, cidade, lat, lng, sla, descricao)
       VALUES ('LOCAL', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [tipo, +prioridade || 0, cliente_nome.trim(), cliente_doc, cliente_fone,
       endereco, bairro, cidade, lat, lng, sla, descricao]
    );

    await query(
      `INSERT INTO os_eventos(os_id, tipo, agente_id, dados)
       VALUES ($1, 'criada', $2, $3)`,
      [rows[0].id, req.agente.agente_id, JSON.stringify({ origem: 'local' })]
    );

    audit(req, 'os_criada', `os:${rows[0].id}`, { tipo });
    res.status(201).json(rows[0]);
  } catch (e) {
    log.error('[os/create]', e.message);
    res.status(500).json({ error: 'erro ao criar OS' });
  }
});

/* ── PUT /:id/atribuir — atribui OS a um agente (despachador/admin) ────── */
router.put('/:id/atribuir', async (req, res) => {
  if (!['despachador','admin'].includes(req.agente.role)) {
    return res.status(403).json({ error: 'sem permissão' });
  }
  try {
    const osId = +req.params.id;
    const { agente_id } = req.body || {};

    await withTx(async c => {
      await c.query(`UPDATE os SET agente_id = $1, atualizada_em = NOW() WHERE id = $2`,
        [agente_id || null, osId]);
      await c.query(
        `INSERT INTO os_eventos(os_id, tipo, agente_id, dados)
         VALUES ($1, 'atribuicao', $2, $3)`,
        [osId, req.agente.agente_id, JSON.stringify({ atribuido_a: agente_id })]
      );
    });

    audit(req, 'os_atribuir', `os:${osId}`, { agente_id });
    res.json({ ok: true });
  } catch (e) {
    log.error('[os/atribuir]', e.message);
    res.status(500).json({ error: 'erro ao atribuir' });
  }
});

export default router;
