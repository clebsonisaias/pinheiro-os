# Checklist de Produção — CITmax Equipe (Play Store)

Status do que foi feito neste repositório e o que ainda depende de ação manual
(chaves, contas, painéis externos).

## ✅ Pronto no código

- [x] PWA com identidade **CITmax Equipe** (nome, descrição, cores)
- [x] Ícones PNG `192` e `512` (`any` + `maskable`) + apple-touch + favicon
- [x] `manifest-tecnico.json` válido (id, scope, display standalone, theme)
- [x] **Service worker** real (`sw-pinheiro.js`): offline (app shell), push e clique de notificação
- [x] Backend de **Web Push** completo: `GET /api/push/vapid-key`, `POST /api/push/subscribe`, envio em `src/services/push.js`
- [x] Push disparado ao **atribuir OS** a um técnico
- [x] `assetlinks.json` servido em `/.well-known/` (Vite copia pro `dist/`)
- [x] Scaffold do TWA (`twa/twa-manifest.json`) pronto pro Bubblewrap
- [x] Build do portal validado (`npm run build`)

## ⚠️ Ação manual antes de publicar (não dá pra fazer no repo)

- [ ] **Gerar chaves VAPID** (`npx web-push generate-vapid-keys`) e setar no Coolify:
      `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
      → sem isso o push fica **desligado** (o resto funciona normal)
- [ ] **Deploy** do `portal-tecnico` em produção (`pinheiro.citmax.com.br`) e validar:
      - `https://pinheiro.citmax.com.br/manifest-tecnico.json`
      - `https://pinheiro.citmax.com.br/sw-pinheiro.js`
      - `https://pinheiro.citmax.com.br/.well-known/assetlinks.json`
- [ ] **Gerar o keystore** de assinatura e guardar em local seguro (ver `twa/README.md`)
- [ ] Colar o **SHA-256** da chave (upload + Play App Signing) no `assetlinks.json` e redeployar
- [ ] **Bubblewrap build** → gerar o `.aab` assinado
- [ ] Testar o `.apk` num device: abre **sem barra de URL** do Chrome
- [ ] Criar o app no **Play Console** (nome, categoria, ficha, screenshots)
- [ ] **Política de privacidade** (URL obrigatória) e questionário de **Segurança de Dados**
      (o app coleta GPS, fotos, dados de cliente — declarar)
- [ ] Classificação indicativa, público-alvo, declaração de permissões sensíveis (localização)
- [ ] Subir em faixa **interna → fechada → produção**

## 🔎 Decisões a confirmar

- **Domínio**: hoje configurado para `pinheiro.citmax.com.br`. Se quiser um domínio
  dedicado (`equipe.citmax.com.br`), trocar em `twa/twa-manifest.json` e garantir o
  `assetlinks.json` servido por esse host.
- **packageId**: `br.com.citmax.equipe` (definitivo — não muda depois de publicado).

## Resposta curta

> **Pode ir pra produção agora?** Ainda não direto: o app está **tecnicamente pronto
> para empacotar**, mas faltam os passos manuais acima (chaves VAPID, keystore +
> fingerprint no assetlinks, gerar o `.aab` e preencher a ficha do Play Console).
> Nenhum deles é desenvolvimento — são configuração e conta. Estimativa: ~1 dia útil.
