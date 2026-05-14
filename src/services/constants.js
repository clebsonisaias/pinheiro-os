/**
 * constants.js — Valores compartilhados pelo backend.
 *
 * Mantém um único ponto de verdade pra status, roles, limites etc.
 * O frontend tem o seu próprio shared.js — quando divergirem, lembrar
 * de sincronizar.
 */

export const OS_STATUS = ['aguardando','confirmada','deslocamento','execucao','concluida','cancelada'];
export const OS_TIPOS  = ['reparo','instalacao','manutencao','vistoria','mudanca','retirada','outro'];
export const ROLES     = ['tecnico','despachador','admin'];

export const AUTH = {
  ttl_dias:         30,
  max_sessoes:       5,
  bcrypt_rounds:    10,
  // Hash fixo (de senha aleatória) pra mitigar timing attack quando o user
  // não existe. Gerado uma vez por boot.
  dummy_hash_seed: 'pinheiro-os-dummy-anti-timing-attack',
};

export const PAGINATION = {
  default: 50,
  max:     200,
};

export const DIAG_CACHE_HORAS = 1;

export const SYNC = {
  intervalo_ms_default: 30_000,
  timeout_ms:           15_000,
  chunk_size:           10,
  max_falhas:            3,
  pausa_apos_falhas_ms:  5 * 60_000,
};
