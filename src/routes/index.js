/**
 * Pinheiro OS — Router principal.
 *
 * Como o Pinheiro é um servidor independente, tudo é montado em raiz.
 * Endpoints finais ficam em:
 *   /api/agentes/{login,logout,me,me/senha,config,posicao}
 *   /api/os/{minhas,fila,:id,...}
 *   /api/ia/{transcribe,diagnostico/:id,duplicadas/:id,...}
 *   /api/health
 */
import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import authRouter   from './auth.js';
import agenteRouter from './agente.js';
import osRouter     from './os.js';
import iaRouter     from './ia.js';

const router = Router();

// Versão lida do package.json — não duplica
let _version = '0.0.0';
try {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
  if (existsSync(pkgPath)) {
    _version = JSON.parse(readFileSync(pkgPath, 'utf8')).version || _version;
  }
} catch {}

router.get('/api/health', (req, res) => {
  const boot = req.app.locals.bootState || { db: 'unknown', dbError: null };
  res.json({
    ok:      true,
    service: 'pinheiro-os',
    version: _version,
    db:      boot.db,         // 'ok' | 'degraded' | 'pending'
    db_error: boot.dbError,   // mensagem em caso de degradado
    ts:      new Date().toISOString(),
  });
});

// /api/agentes — auth + config + posicao (dois routers compõem no mesmo prefix)
router.use('/api/agentes', authRouter);
router.use('/api/agentes', agenteRouter);

router.use('/api/os', osRouter);
router.use('/api/ia', iaRouter);

export default router;
