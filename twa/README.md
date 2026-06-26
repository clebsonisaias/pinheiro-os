# CITmax Equipe — App Android (TWA)

Empacotamento do PWA **CITmax Equipe** (`portal-tecnico`) como app Android nativo
usando **TWA — Trusted Web Activity** via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).

O TWA é só uma "casca" que abre o PWA em tela cheia, sem barra do navegador.
Todo o código continua sendo o do `portal-tecnico` — o app **não** tem lógica própria.

> **Host configurado:** `pinheiro.citmax.com.br`
> Se for usar outro domínio (ex.: `equipe.citmax.com.br`), troque em **todos** os
> lugares: `twa-manifest.json`, e o `assetlinks.json` precisa ser servido por esse host.

---

## Pré-requisitos (na máquina de build, não neste container)

- **JDK 17**
- **Android SDK** (build-tools + platform-tools)
- **Node.js 18+**
- Bubblewrap CLI:
  ```bash
  npm install -g @bubblewrap/cli
  ```

## 1. Gerar a chave de assinatura (uma única vez)

```bash
cd twa
keytool -genkeypair -v \
  -keystore android.keystore \
  -alias citmax-equipe \
  -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ **Guarde o `android.keystore` e as senhas em local seguro.** Se perder,
> não dá pra publicar atualizações do app. **Não comite o keystore** (já está no `.gitignore`).

## 2. Pegar o SHA-256 da chave e publicar o Digital Asset Links

```bash
keytool -list -v -keystore android.keystore -alias citmax-equipe | grep SHA256
```

Copie o fingerprint (formato `AA:BB:CC:...`) e cole em:
`portal-tecnico/public/.well-known/assetlinks.json`
(substituindo `SUBSTITUA_PELO_SHA256_...`).

> **Importante — Play App Signing:** ao publicar pela primeira vez, o Google
> gera **outra** chave de assinatura. Depois do upload, vá em
> *Play Console → Configuração → Integridade do app* e copie o SHA-256 da
> **chave de assinatura do app**. Adicione **os dois** fingerprints
> (upload + Play) no array `sha256_cert_fingerprints`. Senão a barra de URL
> aparece dentro do app.

Faça deploy do `portal-tecnico` para que o arquivo fique acessível em:
`https://pinheiro.citmax.com.br/.well-known/assetlinks.json`

Valide:
```bash
curl -s https://pinheiro.citmax.com.br/.well-known/assetlinks.json
```

## 3. Build do TWA

```bash
cd twa
# Inicializa o projeto Android a partir do manifesto já preenchido:
bubblewrap init --manifest=./twa-manifest.json
# (ou, se já inicializado, só atualize)
bubblewrap update

# Gera o App Bundle assinado pra Play Store:
bubblewrap build
```

Saída:
- `app-release-bundle.aab` → **é isto que sobe no Play Console**
- `app-release-signed.apk` → para teste manual em um device

## 4. Testar antes de publicar

```bash
adb install app-release-signed.apk
```

Confirme: app abre **em tela cheia, sem a barra de endereço do Chrome**.
Se aparecer a barra, o `assetlinks.json` não está batendo com a chave (volte ao passo 2).

## 5. Publicar no Google Play

1. [Play Console](https://play.google.com/console) → **Criar app**
2. Nome: **CITmax Equipe** · idioma padrão pt-BR · categoria *Empresarial*
3. Suba o `.aab` numa faixa (interna → fechada → produção)
4. Preencha a ficha: ícone 512×512 (`portal-tecnico/public/icon-512.png`),
   capturas de tela, descrição, política de privacidade (URL obrigatória)
5. Preencha os questionários: classificação indicativa, segurança de dados,
   público-alvo, anúncios (não)
6. Envie para revisão

## Atualizações futuras do app nativo

Só é preciso re-buildar o `.aab` quando mudar **a casca** (ícone, nome,
versão mínima do Android, cor). Mudanças no conteúdo do PWA entram sozinhas
(é web). Ao re-buildar, **suba `appVersionCode`** em `twa-manifest.json`.

Mudou só o PWA? Basta fazer deploy do `portal-tecnico` — nada a fazer aqui.
