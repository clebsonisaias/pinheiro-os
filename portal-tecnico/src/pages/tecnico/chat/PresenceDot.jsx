// PresenceDot — bolinha de presença (online/offline) + texto "visto às…".
import React from 'react';
import { T } from '../shared';

export function ultimoVistoLabel(online, ultimoVisto) {
  if (online) return 'online';
  if (!ultimoVisto) return 'offline';
  const d = new Date(ultimoVisto);
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return hoje ? `visto às ${hora}` : `visto em ${d.toLocaleDateString('pt-BR')}`;
}

export function PresenceDot({ online, size = 9, style }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: online ? T.green : T.nano,
      boxShadow: online ? `0 0 0 2px ${T.bg}, 0 0 6px ${T.green}` : `0 0 0 2px ${T.bg}`,
      ...style,
    }} />
  );
}
