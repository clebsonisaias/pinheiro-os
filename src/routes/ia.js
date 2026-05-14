/**
 * Pinheiro OS — Endpoints de IA.
 * Montado em /api/ia/*
 *
 *   POST /transcribe              Whisper (OpenAI) — fallback mock se sem key
 *   GET  /diagnostico/:os_id      Diagnóstico assistido (mock determinístico + cache 1h)
 *   GET  /duplicadas/:os_id       Heurística determinística
 *   POST /duplicadas/dispensar    Feedback humano (dataset p/ fine-tuning)
 */
import { Router }   from 'express';
import multer       from 'multer';
import crypto       from 'node:crypto';
import { query }    from '../services/db.js';
import { authMw }   from './auth.js';
import { audit }    from '../services/audit.js';
import { log }      from '../services/logger.js';
import { DIAG_CACHE_HORAS } from '../services/constants.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

const router = Router();
router.use(authMw);

/* ── POST /transcribe (audio multipart → texto) ─────────────────────────── */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'áudio ausente' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      audit(req, 'ia_transcribe_mock');
      return res.json({ texto: '[mock] Defina OPENAI_API_KEY no .env para ativar a transcrição via Whisper.' });
    }

    const fd = new FormData();
    fd.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), 'audio.webm');
    fd.append('model', 'whisper-1');
    fd.append('language', 'pt');
    if (req.body?.contexto) fd.append('prompt', String(req.body.contexto).slice(0, 240));

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: fd,
    });
    if (!r.ok) {
      const e = await r.text();
      log.warn('[ia/whisper]', e.slice(0, 200));
      return res.status(502).json({ error: 'Whisper falhou' });
    }
    const d = await r.json();
    audit(req, 'ia_transcribe_ok', null, { bytes: req.file.size });
    res.json({ texto: (d.text || '').trim() });
  } catch (e) {
    log.error('[ia/transcribe]', e);
    res.status(500).json({ error: 'erro na transcrição' });
  }
});

/* ── GET /diagnostico/:os_id ────────────────────────────────────────────── */
router.get('/diagnostico/:os_id', async (req, res) => {
  try {
    const osId = +req.params.os_id;
    if (!osId) return res.status(400).json({ error: 'os_id inválido' });

    // Cache de 1h
    const cache = await query(
      `SELECT payload FROM ia_diagnosticos_cache
       WHERE os_id = $1 AND gerado_em > NOW() - INTERVAL '${DIAG_CACHE_HORAS} hour'`,
      [osId]
    );
    if (cache.rows.length) return res.json(cache.rows[0].payload);

    const { rows: osRows } = await query(`SELECT * FROM os WHERE id = $1`, [osId]);
    if (!osRows.length) return res.status(404).json({ error: 'OS não encontrada' });

    const { rows: historico } = await query(
      `SELECT id, tipo, status, criada_em, fechada_em
       FROM os
       WHERE id <> $1
         AND ((cliente_doc IS NOT NULL AND $2 <> '' AND cliente_doc = $2)
              OR ($3 <> '' AND cliente_nome ILIKE '%' || $3 || '%'))
       ORDER BY criada_em DESC LIMIT 10`,
      [osId, osRows[0].cliente_doc || '', osRows[0].cliente_nome || '__NUNCA__']
    );

    // TODO: integrar com LLM (Claude/OpenAI) + dados SGP de sinal reais.
    const dado = montarDiagnosticoMock(osRows[0], historico);

    await query(
      `INSERT INTO ia_diagnosticos_cache(os_id, payload) VALUES ($1, $2)
       ON CONFLICT (os_id) DO UPDATE SET payload = $2, gerado_em = NOW()`,
      [osId, JSON.stringify(dado)]
    );
    res.json(dado);
  } catch (e) {
    log.error('[ia/diagnostico]', e);
    res.status(500).json({ error: 'erro no diagnóstico' });
  }
});

/* ── GET /duplicadas/:os_id ─────────────────────────────────────────────── */
router.get('/duplicadas/:os_id', async (req, res) => {
  try {
    const osId = +req.params.os_id;
    const { rows } = await query(`SELECT * FROM os WHERE id = $1`, [osId]);
    if (!rows.length) return res.json({ matches: [] });
    const atual = rows[0];

    const { rows: cands } = await query(
      `SELECT id, fonte, fonte_id, cliente_nome, cliente_doc,
              endereco, lat, lng, criada_em, status, agente_id
       FROM os
       WHERE id <> $1
         AND criada_em > NOW() - INTERVAL '48 hours'
         AND status NOT IN ('concluida','cancelada')
         AND (
           ($2 <> '' AND cliente_doc = $2)
           OR ($3 <> '' AND cliente_nome ILIKE '%' || $3 || '%')
           OR ($4 IS NOT NULL AND $5 IS NOT NULL
               AND lat IS NOT NULL AND lng IS NOT NULL
               AND abs(lat - $4) < 0.001 AND abs(lng - $5) < 0.001)
         )
       LIMIT 20`,
      [osId, atual.cliente_doc || '', atual.cliente_nome || '', atual.lat, atual.lng]
    );

    const matches = cands
      .map(c => scoreCandidate(atual, c))
      .filter(m => m.score >= 0.55)
      .sort((a, b) => b.score - a.score);

    if (matches.length) {
      const ids = matches.map(m => m.os_id);
      const { rows: fb } = await query(
        `SELECT os_b FROM ia_duplicadas_feedback
         WHERE os_a = $1 AND os_b = ANY($2::int[]) AND dispensada = true`,
        [osId, ids]
      );
      const dispensadas = new Set(fb.map(r => r.os_b));
      return res.json({ matches: matches.filter(m => !dispensadas.has(m.os_id)) });
    }
    res.json({ matches });
  } catch (e) {
    log.error('[ia/duplicadas]', e.message);
    res.status(500).json({ error: 'erro ao buscar duplicadas' });
  }
});

/* ── POST /duplicadas/dispensar ─────────────────────────────────────────── */
router.post('/duplicadas/dispensar', async (req, res) => {
  try {
    const { a, b } = req.body || {};
    const aN = +a, bN = +b;
    if (!aN || !bN || aN === bN) return res.status(400).json({ error: 'a e b obrigatórios e distintos' });

    await query(
      `INSERT INTO ia_duplicadas_feedback(os_a, os_b, dispensada, agente_id)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (os_a, os_b) DO UPDATE SET dispensada = true, criado_em = NOW()`,
      [aN, bN, req.agente.agente_id]
    );
    audit(req, 'ia_duplicadas_dispensar', `os:${aN}`, { outro: bN });
    res.json({ ok: true });
  } catch (e) {
    log.error('[ia/dispensar]', e.message);
    res.status(500).json({ error: 'erro ao registrar feedback' });
  }
});

/* ── Helpers ────────────────────────────────────────────────────────────── */
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const x = Math.sin(dLat/2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function scoreCandidate(atual, c) {
  let score = 0; const motivos = [];

  if (atual.cliente_doc && c.cliente_doc && atual.cliente_doc === c.cliente_doc) {
    score += 0.5; motivos.push('mesmo documento');
  }
  if (atual.endereco && c.endereco && atual.endereco === c.endereco) {
    score += 0.3; motivos.push('mesmo endereço');
  }
  const km = haversineKm(atual.lat, atual.lng, c.lat, c.lng);
  if (Number.isFinite(km) && km < 0.05) {
    score += 0.3; motivos.push(`${Math.round(km * 1000)}m de distância`);
  }
  if (atual.fonte !== c.fonte) {
    score += 0.1; motivos.push(`outra fonte (${c.fonte})`);
  }

  return {
    os_id: c.id, fonte: c.fonte,
    score: Math.min(score, 1),
    motivo: motivos.join(' + '),
    criada_em: c.criada_em,
  };
}

/**
 * Gera mock determinístico (mesmo input → mesma saída) baseado em hash do osId.
 * Com cache de 1h não importa muito, mas evita pegadinhas em testes/dev.
 */
function montarDiagnosticoMock(os, historico) {
  const recorrente = historico.length >= 3;
  const tipo = os.tipo || 'reparo';

  // Seed determinístico do osId pra "randomizar" sem random
  const seed = parseInt(crypto.createHash('md5').update(String(os.id)).digest('hex').slice(0, 8), 16);
  const pseudoRand = (offset) => ((seed >> (offset % 24)) & 0xff) / 255;

  const causa = recorrente
    ? `Problema recorrente — ${historico.length} chamados em 60 dias. Avaliar substituição completa de ONU/drop ou degradação na rede do bairro.`
    : tipo === 'instalacao'
    ? 'Instalação nova. Confirmar viabilidade no CTO mais próximo e disponibilidade de porta livre.'
    : 'Sinal degradado intermitente — provável fusão deficiente no CTO ou drop danificado.';

  const equipamentos = tipo === 'instalacao'
    ? [
        { nome: 'ONU HG8245H5', qtd: 1 },
        { nome: 'Cordão SC/APC 3m', qtd: 1 },
        { nome: 'Roseta óptica', qtd: 1 },
        { nome: 'Fonte 12V', qtd: 1 },
      ]
    : [
        { nome: 'ONU reserva', qtd: 1 },
        { nome: 'Cordão SC/APC 3m', qtd: 2 },
        { nome: 'Conector mecânico', qtd: 4 },
      ];

  const base = -21 - (recorrente ? pseudoRand(0) * 2 : 0);
  const sinal_serie = Array.from({ length: 7 }, (_, i) =>
    +(base - (recorrente ? i * 0.6 : pseudoRand(i + 4) * 0.4 - 0.2)).toFixed(1)
  );

  return {
    causa_provavel: causa,
    confianca: recorrente ? 0.84 : 0.66,
    equipamentos,
    historico_resumo: recorrente
      ? `${historico.length} chamados nos últimos 60 dias deste cliente. Último em ${formatarDia(historico[0]?.criada_em)}.`
      : historico.length
        ? `Último contato em ${formatarDia(historico[0]?.criada_em)} (${historico[0]?.tipo}).`
        : 'Cliente sem histórico anterior.',
    sinal_serie,
    mock: true, // sinaliza que ainda é mock — quando integrar LLM real, remover
  };
}

function formatarDia(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default router;
