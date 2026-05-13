/**
 * Pinheiro OS — Rotas das Ordens de Serviço.
 * Montado em /ondaos/api/os/* e /ondaos/api/agentes/posicao
 */
import { Router } from 'express';
import { query, withTx } from '../services/db.js';
import { authMw } from './auth.js';

const router = Router();
router.use(authMw);

const STATUS_VALIDOS = ['aguardando','confirmada','deslocamento','execucao','concluida','cancelada'];

/* ── GET /minhas — OS do agente logado ──────────────────────────────────── */
router.get('/minhas', async (req, res) => {
  try {
    const { status, dia } = req.query;
    const cond = ['agente_id = $1'];
    const params = [req.agente.agente_id];

    if (status && STATUS_VALIDOS.includes(status)) {
      params.push(status); cond.push(`status = $${params.length}`);
    }
    if (dia === 'hoje') {
      cond.push(`(DATE(criada_em AT TIME ZONE 'America/Recife') = CURRENT_DATE
                  OR status NOT IN ('concluida','cancelada'))`);
    }

    const { rows } = await query(
      `SELECT id, fonte, fonte_id, tipo, status, prioridade,
              cliente_nome, cliente_doc, cliente_fone,
              endereco, bairro, cidade, lat, lng,
              sla, descricao, criada_em, atualizada_em, iniciada_em
       FROM os
       WHERE ${cond.join(' AND ')}
       ORDER BY sla NULLS LAST, prioridade DESC, criada_em ASC`,
      params
    );
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /fila — OS sem agente (para despachador) ───────────────────────── */
router.get('/fila', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, fonte, fonte_id, tipo, status, prioridade,
              cliente_nome, endereco, sla, lat, lng, criada_em
       FROM os
       WHERE agente_id IS NULL AND status NOT IN ('concluida','cancelada')
       ORDER BY sla NULLS LAST, prioridade DESC, criada_em ASC
       LIMIT 200`
    );
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
      query(`SELECT * FROM os_eventos    WHERE os_id=$1 ORDER BY criado_em DESC LIMIT 80`, [id]),
      query(`SELECT * FROM os_checklist  WHERE os_id=$1 ORDER BY ordem ASC, id ASC`,        [id]),
      query(`SELECT * FROM os_fotos      WHERE os_id=$1 ORDER BY tirada_em DESC`,           [id]),
      query(`SELECT * FROM os_observacoes WHERE os_id=$1 ORDER BY criado_em DESC`,          [id]),
    ]);

    res.json({
      ...os,
      eventos:     ev.rows,
      checklist:   ck.rows,
      fotos:       fo.rows,
      observacoes: ob.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PUT /:id/status — muda status da OS + grava evento ─────────────────── */
router.put('/:id/status', async (req, res) => {
  try {
    const id = +req.params.id;
    const { status } = req.body || {};
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'status inválido' });

    await withTx(async c => {
      const setIniciada = status === 'execucao' ? ', iniciada_em = COALESCE(iniciada_em, NOW())' : '';
      const setFechada  = ['concluida','cancelada'].includes(status)
        ? ', fechada_em = COALESCE(fechada_em, NOW())' : '';
      await c.query(
        `UPDATE os
         SET status = $1, atualizada_em = NOW() ${setIniciada} ${setFechada}
         WHERE id = $2`,
        [status, id]
      );
      await c.query(
        `INSERT INTO os_eventos(os_id, tipo, agente_id, dados)
         VALUES ($1, 'status_change', $2, $3)`,
        [id, req.agente.agente_id, JSON.stringify({ novo_status: status })]
      );
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /:id/observacao — adiciona texto (manual ou voz) ──────────────── */
router.post('/:id/observacao', async (req, res) => {
  try {
    const id = +req.params.id;
    const { texto, fonte = 'manual' } = req.body || {};
    if (!texto?.trim()) return res.status(400).json({ error: 'texto vazio' });
    if (!['manual','voz','sistema'].includes(fonte)) return res.status(400).json({ error: 'fonte inválida' });

    const { rows } = await query(
      `INSERT INTO os_observacoes(os_id, texto, fonte, agente_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, texto.trim(), fonte, req.agente.agente_id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
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
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST / — criar OS local (não vinda de SGP/Maxxi) ───────────────────── */
router.post('/', async (req, res) => {
  try {
    const {
      tipo = 'outro', cliente_nome, cliente_doc, cliente_fone,
      endereco, bairro, cidade, lat, lng, sla, descricao, prioridade = 0,
    } = req.body || {};

    if (!cliente_nome) return res.status(400).json({ error: 'cliente_nome obrigatório' });

    const { rows } = await query(
      `INSERT INTO os(fonte, tipo, prioridade, cliente_nome, cliente_doc, cliente_fone,
                      endereco, bairro, cidade, lat, lng, sla, descricao)
       VALUES ('LOCAL', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [tipo, prioridade, cliente_nome, cliente_doc, cliente_fone,
       endereco, bairro, cidade, lat, lng, sla, descricao]
    );

    await query(
      `INSERT INTO os_eventos(os_id, tipo, agente_id, dados)
       VALUES ($1, 'criada', $2, $3)`,
      [rows[0].id, req.agente.agente_id, JSON.stringify({ origem: 'local' })]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PUT /:id/atribuir — atribui OS a um agente (despachador/admin) ────── */
router.put('/:id/atribuir', async (req, res) => {
  if (!['despachador','admin'].includes(req.agente.role)) {
    return res.status(403).json({ error: 'sem permissão' });
  }
  try {
    const { agente_id } = req.body || {};
    await withTx(async c => {
      await c.query(`UPDATE os SET agente_id = $1, atualizada_em = NOW() WHERE id = $2`,
        [agente_id || null, +req.params.id]);
      await c.query(
        `INSERT INTO os_eventos(os_id, tipo, agente_id, dados)
         VALUES ($1, 'atribuicao', $2, $3)`,
        [+req.params.id, req.agente.agente_id, JSON.stringify({ atribuido_a: agente_id })]
      );
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
