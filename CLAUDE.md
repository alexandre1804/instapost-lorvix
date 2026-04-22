# InstaPost AI — Contexto do Projeto

> Arquivo de referência para o Claude Code ao atualizar ou expandir o app.

---

## Visão Geral

App PWA de geração de conteúdo para Instagram com IA.  
Gera legenda, imagem e hashtags para posts, reels e carrosseis de 6 slides.  
Modelo de negócio híbrido: Basic (chaves do dono) + Pro (chave própria do usuário).

**URL em produção:** https://instapost.lorvix.com.br  
**Repositório:** https://github.com/alexandre1804/instapost-lorvix

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML + CSS + JS puro (sem framework) — arquivo único `public/index.html` |
| Backend | Node.js + Express — `server.js` |
| Autenticação | JWT (30 dias) via `jsonwebtoken` |
| Storage | JSON flat files (`users.json`, `usage.json`) — sem banco de dados |
| Hosting | VPS Hostinger Ubuntu — IP `187.127.19.20` |
| Processo | PM2 — `pm2 restart instapost` |
| Proxy reverso | Nginx |
| SSL | Certbot / Let's Encrypt — auto-renovação |
| Deploy | GitHub → `git stash && git pull && pm2 restart instapost` |

---

## Estrutura de Arquivos

```
instapost-lorvix/
├── server.js           ← Backend principal (todas as rotas de API)
├── package.json        ← Dependências: express, cors, jsonwebtoken, node-fetch, dotenv
├── .gitignore          ← Ignora: .env, node_modules/, users.json, usage.json
├── env.example         ← Modelo do .env (sem valores reais)
├── README.md           ← Instruções de instalação
└── public/
    └── index.html      ← Frontend completo (PWA, tela única)
```

**Arquivos que existem só na VPS (não estão no GitHub):**
- `.env` — chaves de API e senhas reais
- `users.json` — usuários cadastrados dinamicamente
- `usage.json` — contagem de posts por usuário/mês

---

## Configuração (.env na VPS)

```env
JWT_SECRET=string-longa-e-aleatoria
ADMIN_PASS=senha-do-admin
ADMIN_EMAIL=admin@lorvix.com.br
ANTHROPIC_KEY=sk-ant-...        # opcional
OPENAI_KEY=sk-proj-...          # atual padrão para texto e imagem
GOOGLE_KEY=AIza-...             # opcional
REPLICATE_KEY=r8_...            # opcional
```

---

## Provedores de IA

### Texto (padrão: OpenAI GPT-4o)
- `anthropic` → Claude Sonnet via `x-api-key` header
- `openai` → GPT-4o via `Authorization: Bearer`
- `google` → Gemini 1.5 Flash via query param `?key=`

### Imagem (padrão: OpenAI DALL-E 3)
- `replicate` → Flux Schnell (mais barato, ~R$0,02/img)
- `openai_img` → DALL-E 3 (~R$0,25/img, atual padrão)

**Para trocar o padrão no server.js:**
```js
const prov    = provider || 'openai';      // texto
const imgProv = provider || 'openai_img';  // imagem
```

---

## Planos de Usuário

| Plano | Chaves usadas | Limite | Observação |
|-------|--------------|--------|-----------|
| `basic` | Chaves do `.env` | 30 posts/mês (configurável em `BASIC_MONTHLY_LIMIT`) | Padrão no cadastro |
| `pro` | Chave própria do usuário | Ilimitado | Usuário cola a key no app |
| `admin` | Chaves do `.env` | Ilimitado | Acessa `/api/admin/stats` |

**Admin fixo** está em `CONFIG.ADMIN` no `server.js` — nunca vai para o `users.json`.  
**Outros usuários** ficam em `users.json` na VPS.

---

## Rotas da API

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/login` | `{ username, password }` → `{ token, user }` |
| POST | `/api/register` | `{ name, username, email, password }` → `{ token, user }` |
| GET | `/api/me` | Retorna dados do usuário logado |
| POST | `/api/forgot/verify` | `{ username, email }` → `{ ok, userId }` |
| POST | `/api/forgot/reset` | `{ userId, newPassword }` → `{ token, user }` |

### IA
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/text` | `{ prompt, provider?, userKey? }` → `{ result }` |
| POST | `/api/image` | `{ prompt, width, height, provider?, userKey? }` → `{ url }` |

### Admin
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/stats` | Lista todos os usuários e uso do mês |
| POST | `/api/admin/set-plan` | `{ userId, plan }` — altera plano de um usuário |
| DELETE | `/api/admin/user/:id` | Remove um usuário |

### Geral
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | `{ status: 'ok', version: '7.0' }` |

---

## Frontend — Estrutura do index.html

O arquivo é dividido em seções bem marcadas com comentários:

```
═══ LOGIN SCREEN ═══     → 4 telas: login, cadastro, esqueci senha (verify + reset)
═══ HEADER ═══           → logo, badge de plano, botão sair
═══ USO BAR ═══          → barra de progresso de posts (só plano basic)
═══ PRO KEYS ═══         → campos de chave (só plano pro)
═══ TABS ═══             → Post/Reel | Carrossel
═══ PANEL POST ═══       → nicho, tipo, tom, formato, estilo, tema, prompt imagem, toggle
═══ PANEL CAROUSEL ═══   → nicho, tom, estilo, tema, prompt imagem
═══ SCRIPT ═══           → toda a lógica JS
```

### Variável importante no JS:
```js
const API = 'https://instapost.lorvix.com.br'; // URL do backend — sempre atualizar se mudar domínio
```

### State global:
```js
const S = {
  post:     { nicho, tipo, tom, estilo, fmt: {w, h}, legenda, hashtags },
  carousel: { nicho, tom, estilo, legenda, hashtags }
}
```

---

## Funcionalidades Atuais

- [x] Login usuário + senha individual
- [x] Cadastro público (entra direto como basic)
- [x] Recuperação de senha (username + email → nova senha)
- [x] Toggle "gerar imagem" no post (desativa para gerar só legenda)
- [x] Campo livre "Descreva a imagem" (opcional — se vazio, IA decide)
- [x] Carrossel: texto do slide incluído no prompt da imagem
- [x] Tom de voz (6 opções)
- [x] Estilo visual (6 opções)
- [x] Formato quadrado (1024×1024) e reel (576×1024)
- [x] Plano Pro: usuário conecta chave própria de texto e imagem
- [x] Barra de uso mensal (plano basic)
- [x] Painel admin via `/api/admin/stats`
- [x] Campo livre de nicho (texto livre, sem pills fixas)
- [x] Carrossel: seletor de quantidade de slides (3, 5, 7 ou 10)

---

## Funcionalidades Pendentes / Ideias Futuras

- [ ] Painel admin visual no app (atualmente só via API)
- [ ] Alterar plano pelo admin no app
- [ ] Histórico dos últimos posts gerados por usuário
- [ ] Limite configurável por usuário (não só global)
- [ ] Notificação quando o usuário está próximo do limite
- [ ] Modo dark/light
- [ ] Exportar carrossel como PDF ou ZIP
- [ ] Suporte a mais nichos customizáveis
- [ ] Webhook para notificar Alexandre quando novo usuário se cadastrar

---

## Comandos Úteis na VPS

```bash
# Ver status
pm2 status

# Ver logs ao vivo
pm2 logs instapost

# Atualizar após push no GitHub
cd /var/www/instapost && git stash && git pull && pm2 restart instapost

# Editar .env (chaves e senhas)
nano /var/www/instapost/.env && pm2 restart instapost

# Ver usuários cadastrados
cat /var/www/instapost/users.json

# Ver uso do mês
cat /var/www/instapost/usage.json

# Verificar sintaxe do server.js antes de reiniciar
node --check /var/www/instapost/server.js
```

---

## Fluxo de Deploy

Após qualquer alteração, seguir este fluxo:

1. Desenvolver na branch de feature (ex: `claude/nome-da-feature`)
2. Criar PR apontando para `main` e fazer o merge
3. Alexandre atualiza a VPS manualmente:
   ```bash
   cd /var/www/instapost && git stash && git pull && pm2 restart instapost
   ```

**Claude faz os passos 1 e 2. Alexandre cuida do passo 3.**

---

## Pontos de Atenção ao Atualizar

1. **Nunca commitar o `.env`** — está no `.gitignore`, chaves ficam só na VPS
2. **`users.json` e `usage.json` ficam só na VPS** — não sobem para o GitHub
3. **Após qualquer mudança no `server.js`**, verificar sintaxe antes: `node --check server.js`
4. **O frontend é um arquivo único** — `public/index.html` contém HTML + CSS + JS
5. **Trocar provedor padrão** requer mudar tanto `server.js` (lógica) quanto `index.html` (state inicial)
6. **CORS não é problema** — o backend está na mesma origem que o frontend (VPS própria)
7. **JWT expira em 30 dias** — ao trocar o `JWT_SECRET` no `.env`, todos os usuários precisam fazer login novamente
8. **Adicionar usuário admin** → editar `CONFIG.ADMIN` no `server.js` ou usar `/api/admin/set-plan`
