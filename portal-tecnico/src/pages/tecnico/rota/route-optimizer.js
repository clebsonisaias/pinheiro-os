// route-optimizer.js — ordena OS por rota inteligente.
// Estratégia: nearest-neighbor heuristic (O(n²)) — bom o suficiente p/ <20 OS.
// Para mais que isso, ou para considerar tráfego real, usa TomTom Matrix Routing.

import { TOMTOM_KEY } from '../shared';

/* ── Distância haversine em km ───────────────────────────────────────────── */
export function distKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat/2) ** 2
          + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/* ── Nearest-neighbor: sempre vai pra próxima mais perto ─────────────────── */
// Retorna `paradas` reordenadas com `dist_km` (distância desde a anterior) anexado.
export function ordenarPorRota(origem, paradas) {
  if (!paradas?.length) return [];
  const restantes = [...paradas];
  const ordem = [];
  let atual = origem;
  while (restantes.length) {
    let melhor = 0, melhorD = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distKm(atual, restantes[i]);
      if (d < melhorD) { melhorD = d; melhor = i; }
    }
    const proxima = restantes.splice(melhor, 1)[0];
    ordem.push({ ...proxima, dist_km: melhorD });
    atual = proxima;
  }
  return ordem;
}

/* ── Estatísticas da rota total ──────────────────────────────────────────── */
// Velocidade média urbana ≈ 25 km/h (inclui paradas em sinal etc.)
export function resumoRota(origem, ordenadas, velKmh = 25) {
  if (!ordenadas?.length || !origem) return { km: '0.0', min: 0 };
  let km = 0, atual = origem;
  for (const p of ordenadas) { km += distKm(atual, p); atual = p; }
  const min = Math.round(km / velKmh * 60);
  return { km: km.toFixed(1), min };
}

/* ── (Opcional) rota otimizada via TomTom — considera tráfego em tempo real */
// Retorna `null` se TOMTOM_KEY ausente ou se a API falhar — caller deve
// tratar como fallback pro nearest-neighbor.
export async function rotaTomTom(origem, paradas) {
  if (!TOMTOM_KEY || !paradas?.length) return null;
  try {
    // computeBestOrder reordena os waypoints minimizando tempo de viagem
    const pontos = [origem, ...paradas].map(p => `${p.lat},${p.lng}`).join(':');
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${pontos}/json`
              + `?key=${TOMTOM_KEY}`
              + `&computeBestOrder=true`
              + `&travelMode=car`
              + `&traffic=true`
              + `&routeType=fastest`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    return d.routes?.[0] || null;
  } catch {
    return null;
  }
}

/* ── Deep link: abre Google Maps com a rota completa em waypoints ────────── */
export function urlMapsRotaCompleta(ordenadas) {
  if (!ordenadas?.length) return null;
  const dst = ordenadas[ordenadas.length - 1];
  const wp  = ordenadas.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|');
  return `https://www.google.com/maps/dir/?api=1`
       + `&destination=${dst.lat},${dst.lng}`
       + (wp ? `&waypoints=${encodeURIComponent(wp)}` : '')
       + `&travelmode=driving`;
}

export function urlMapsParaPonto(p) {
  return `https://www.google.com/maps/dir/?api=1`
       + `&destination=${p.lat},${p.lng}`
       + `&travelmode=driving`;
}
