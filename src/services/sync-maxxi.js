/**
 * sync-maxxi.js — Puxa tickets do Maxxi via /api/v1/* e materializa como
 * OS locais no Pinheiro.
 *
 * Apenas tickets de TIPO "técnico" ou "instalação" são importados — outros
 * (financeiro, comercial, etc.) ficam no Maxxi.
 *
 * Estratégia:
 *   1. Lê /api/v1/ticket-categories pra descobrir IDs/slugs das categorias
 *      "técnico" e "instalação" (mapeamento flexível por nome).
 *   2. Lista tickets dessas categorias modificados desde o último sync.
 *   3. Upsert na tabela `os` usando (fonte='MXX', fonte_id=ticket.id).
 *   4. Mantém o cursor (last_sync_at) em sistema_kv.
 *
 * Config: MAXXI_API_URL, MAXXI_API_KEY, MAXXI_SYNC_INTERVAL_MS
 */
import { query, withTx } from './db.js';

const TIPOS_DESEJADOS = ['tecnico', 'técnico', 'tecnica', 'técnica', 'instalacao', 'instalação'];

// Mapeia category-nome do Maxxi → tipo de OS interno do Pinheiro
function mapearTipoOS(categoriaNome) {
  const n = (categoriaNome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n.includes('instal')) return 'instalacao';
  if (n.includes('tecn') || n.includes('manut') || n.includes('repar')) return 'reparo';
  return 'outro';
}

// Mapeia status do ticket Maxxi → status da OS Pinheiro
function mapearStatus(statusTicket) {
  const m = {
    aberto: 'aguardando',
    em_andamento: 'execucao',
    fechado: 'concluida',
    cancelado: 'cancelada',
    aguardando: 'aguardando',
    concluido: 'concluida',
  };
  return m[String(statusTicket || '').toLowerCase()] || 'aguardando';
}

let _running = false;
let _timer   = null;

export function iniciarSyncMaxxi({ intervaloMs = 30_000 } = {}) {
  if (!process.env.MAXXI_API_URL || !process.env.MAXXI_API_KEY) {
    console.warn('[sync-maxxi] desabilitado — MAXXI_API_URL/MAXXI_API_KEY ausentes');
    return;
  }
  console.log(`[sync-maxxi] iniciado · intervalo ${intervaloMs}ms · alvo ${process.env.MAXXI_API_URL}`);

  // Garante a tabela sistema_kv (cursor do sync)
  query(`
    CREATE TABLE IF NOT EXISTS sistema_kv (
      chave      TEXT PRIMARY KEY,
      valor      JSONB,
      atualizado TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(e => console.warn('[sync-maxxi] kv setup:', e.message));

  // Primeira execução em 5s, depois no intervalo
  setTimeout(rodarCiclo, 5_000);
  _timer = setInterval(rodarCiclo, intervaloMs);
}

export function pararSyncMaxxi() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

async function rodarCiclo() {
  if (_running) return; // evita overlap
  _running = true;
  try {
    const ids = await descobrirCategorias();
    if (!ids.length) {
      console.warn('[sync-maxxi] nenhuma categoria técnica/instalação encontrada no Maxxi');
      return;
    }

    const desde = await pegarCursor();
    const tickets = await listarTicketsRecentes(ids, desde);
    if (!tickets.length) return;

    let inseridos = 0, atualizados = 0;
    for (const t of tickets) {
      const acao = await upsertOS(t);
      if (acao === 'insert') inseridos++;
      else if (acao === 'update') atualizados++;
    }

    // Atualiza cursor com o maior `updated_at` dos tickets recebidos
    const maxUpdated = tickets.reduce((m, t) => {
      const u = new Date(t.updated_at || t.atualizado_em || t.created_at).getTime();
      return u > m ? u : m;
    }, 0);
    if (maxUpdated > 0) await setCursor(new Date(maxUpdated).toISOString());

    if (inseridos || atualizados) {
      console.log(`[sync-maxxi] +${inseridos} novos · ${atualizados} atualizados`);
    }
  } catch (e) {
    console.warn('[sync-maxxi] ciclo falhou:', e.message);
  } finally {
    _running = false;
  }
}

/* ── Descobre IDs das categorias técnico/instalação ──────────────────────── */
let _cacheCategorias = { ids: null, ts: 0 };
async function descobrirCategorias() {
  // cache de 5 min — categorias raramente mudam
  if (_cacheCategorias.ids && Date.now() - _cacheCategorias.ts < 5 * 60 * 1000) {
    return _cacheCategorias.ids;
  }
  const r = await fetchMaxxi('/ticket-categories');
  const lista = r?.data || r?.categories || [];
  const filtrados = lista
    .filter(c => {
      const n = (c.nome || c.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return TIPOS_DESEJADOS.some(t => n.includes(t.normalize('NFD').replace(/[̀-ͯ]/g, '')));
    })
    .map(c => c.id);

  _cacheCategorias = { ids: filtrados, ts: Date.now() };
  if (filtrados.length === 0) {
    console.warn('[sync-maxxi] categorias filtráveis não bateram — verifique nomes no Maxxi');
  }
  return filtrados;
}

/* ── Lista tickets modificados desde `desde` ─────────────────────────────── */
async function listarTicketsRecentes(categoriaIds, desde) {
  const params = new URLSearchParams({
    limit: '200',
    // Maxxi v1 aceita filtros por categoria; se sua API expor outro nome,
    // ajuste aqui (ex: tipo_id, ticket_type_id).
    categoria_id: categoriaIds.join(','),
  });
  if (desde) params.set('updated_since', desde);

  const r = await fetchMaxxi('/tickets?' + params.toString());
  return r?.data || r?.tickets || [];
}

/* ── Upsert na tabela `os` ──────────────────────────────────────────────── */
async function upsertOS(t) {
  // Mapeamento defensivo — nomes podem variar entre versões do Maxxi
  const tipo     = mapearTipoOS(t.categoria_nome || t.category_name || t.tipo_nome);
  const status   = mapearStatus(t.status);
  const cliente  = t.cliente_nome || t.cliente?.nome || t.customer_name || null;
  const doc      = t.cliente_doc  || t.cliente?.cpf  || t.cliente?.cnpj || null;
  const fone     = t.cliente_fone || t.cliente?.telefone || null;
  const endereco = t.endereco     || t.cliente?.endereco || null;
  const lat      = t.lat ?? t.latitude ?? t.cliente?.lat ?? null;
  const lng      = t.lng ?? t.longitude ?? t.cliente?.lng ?? null;
  const sla      = t.sla || t.prazo || null;
  const descr    = t.descricao || t.titulo || t.title || null;

  const result = await withTx(async c => {
    const { rows } = await c.query(
      `INSERT INTO os (fonte, fonte_id, tipo, status, cliente_nome, cliente_doc,
                       cliente_fone, endereco, lat, lng, sla, descricao,
                       dados_externos, criada_em, atualizada_em)
       VALUES ('MXX', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW(), NOW())
       ON CONFLICT (fonte, fonte_id) DO UPDATE SET
         tipo           = EXCLUDED.tipo,
         status         = EXCLUDED.status,
         cliente_nome   = COALESCE(EXCLUDED.cliente_nome, os.cliente_nome),
         cliente_doc    = COALESCE(EXCLUDED.cliente_doc,  os.cliente_doc),
         cliente_fone   = COALESCE(EXCLUDED.cliente_fone, os.cliente_fone),
         endereco       = COALESCE(EXCLUDED.endereco,     os.endereco),
         lat            = COALESCE(EXCLUDED.lat,          os.lat),
         lng            = COALESCE(EXCLUDED.lng,          os.lng),
         sla            = COALESCE(EXCLUDED.sla,          os.sla),
         descricao      = COALESCE(EXCLUDED.descricao,    os.descricao),
         dados_externos = EXCLUDED.dados_externos,
         atualizada_em  = NOW()
       RETURNING id, (xmax = 0) AS inserido`,
      [String(t.id), tipo, status, cliente, doc, fone, endereco, lat, lng, sla, descr, JSON.stringify(t)]
    );

    // Grava evento de origem
    if (rows[0]?.inserido) {
      await c.query(
        `INSERT INTO os_eventos (os_id, tipo, dados)
         VALUES ($1, 'importada_do_maxxi', $2::jsonb)`,
        [rows[0].id, JSON.stringify({ ticket_id: t.id, categoria: t.categoria_nome })]
      );
    }
    return rows[0]?.inserido ? 'insert' : 'update';
  });

  return result;
}

/* ── Cursor (último sync) em sistema_kv ─────────────────────────────────── */
async function pegarCursor() {
  try {
    const r = await query(`SELECT valor FROM sistema_kv WHERE chave = 'sync_maxxi_cursor'`);
    return r.rows[0]?.valor?.ts || null;
  } catch { return null; }
}

async function setCursor(ts) {
  await query(
    `INSERT INTO sistema_kv (chave, valor, atualizado)
     VALUES ('sync_maxxi_cursor', $1::jsonb, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, atualizado = NOW()`,
    [JSON.stringify({ ts })]
  );
}

/* ── Wrapper de fetch com auth + timeout ────────────────────────────────── */
async function fetchMaxxi(path) {
  const url = process.env.MAXXI_API_URL.replace(/\/$/, '') + path;
  const ctrl = new AbortController();
  const to   = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.MAXXI_API_KEY}`,
        'Accept': 'application/json',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Maxxi ${res.status}: ${txt.slice(0, 120)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}
