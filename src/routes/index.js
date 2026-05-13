/**
 * Pinheiro OS — Router principal.
 *
 * Como o Pinheiro é um servidor independente, tudo é montado em raiz.
 * Endpoints finais ficam em:
 *   /api/agentes/{login,logout,me,me/senha}
 *   /api/os/{minhas,fila,:id,...}
 *   /api/ia/{transcribe,diagnostico/:id,duplicadas/:id,...}
 *   /api/health
 */
import { Router } from 'express';
import authRouter from './auth.js';
import osRouter   from './os.js';
import iaRouter   from './ia.js';

const router = Router();

router.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'pinheiro-os',
    version: '0.1.0',
    ts: new Date().toISOString(),
  });
});

router.use('/api/agentes', authRouter);
router.use('/api/os',      osRouter);
router.use('/api/ia',      iaRouter);

export default router;
