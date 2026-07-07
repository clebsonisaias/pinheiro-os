/**
 * storage.js — Armazenamento de mídia do chat em volume no servidor.
 *
 * Decisão de arquitetura: arquivos ficam no filesystem (volume persistente
 * do Docker/Coolify), servidos pelo Express com suporte a Range. Sem S3,
 * sem base64 no banco. No banco guardamos só o caminho relativo + metadados.
 *
 * IMPORTANTE (deploy): monte UPLOAD_DIR como volume persistente, senão a
 * mídia some a cada redeploy.
 *
 * Estrutura: <UPLOAD_DIR>/chat/YYYY/MM/<uuid>.<ext>
 */
import crypto from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { log } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Raiz absoluta dos uploads. Default: <repo>/uploads
export const UPLOAD_DIR = resolve(
  process.env.UPLOAD_DIR || join(__dirname, '..', '..', 'uploads')
);

// Limites por tipo (bytes)
export const LIMITES = {
  foto:    15 * 1024 * 1024,
  audio:   15 * 1024 * 1024,
  video:   50 * 1024 * 1024,   // FASE 2
  arquivo: 25 * 1024 * 1024,
};

// Mimes aceitos por tipo lógico
const MIMES = {
  foto:  /^image\//,
  audio: /^audio\//,
  video: /^video\//,
};

export function garantirUploadDir() {
  try {
    mkdirSync(join(UPLOAD_DIR, 'chat'), { recursive: true });
    log.info(`[storage] uploads em ${UPLOAD_DIR}`);
  } catch (e) {
    log.error('[storage] falha ao criar UPLOAD_DIR:', e.message);
  }
}

/** Converte um path absoluto do disco em caminho relativo guardado no banco. */
export function toRelativo(absPath) {
  return absPath.slice(UPLOAD_DIR.length).replace(/^[/\\]/, '').split(sep).join('/');
}

/** Resolve um caminho relativo do banco para absoluto, barrando path traversal. */
export function toAbsoluto(relPath) {
  const abs = resolve(UPLOAD_DIR, relPath);
  if (abs !== UPLOAD_DIR && !abs.startsWith(UPLOAD_DIR + sep)) {
    throw new Error('caminho fora do diretório de uploads');
  }
  return abs;
}

// Um multer diskStorage que organiza por ano/mês e nomeia com uuid.
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const d = new Date();
    const sub = join(UPLOAD_DIR, 'chat', String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, '0'));
    try { mkdirSync(sub, { recursive: true }); cb(null, sub); }
    catch (e) { cb(e); }
  },
  filename(_req, file, cb) {
    const ext = (extname(file.originalname || '') || '').slice(0, 12);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/**
 * Confere se o MIME é compatível com o tipo lógico.
 * 'arquivo' aceita qualquer coisa; foto/audio/video exigem o prefixo correto.
 * NÃO usar isso no fileFilter do multer: em multipart, o campo 'tipo' pode ainda
 * não ter sido parseado quando a parte do arquivo chega. Validar no handler,
 * depois que req.body está populado.
 */
export function mimeCompativel(tipo, mime) {
  const re = MIMES[tipo];
  if (!re) return tipo === 'arquivo';
  return re.test(mime || '');
}

/** Middleware multer para 1 anexo no campo 'file'. Teto de tamanho = vídeo;
 *  validação de MIME e refino de limite por tipo são feitos no handler. */
export const uploadAnexo = multer({
  storage,
  limits: { fileSize: LIMITES.video, files: 1 },
}).single('file');

export { existsSync };
