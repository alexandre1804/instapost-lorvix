# InstaPost AI — Claude Code Context

## Stack
- Frontend: `public/index.html` (HTML+CSS+JS puro, sem framework)
- Backend: `server.js` (Node.js + Express)
- Auth: JWT 30 dias (`jsonwebtoken`)
- Storage: `users.json` + `usage.json` (flat files, sem banco)
- VPS: Hostinger Ubuntu, IP `187.127.19.20`
- Processo: PM2 (`pm2 restart instapost`)
- Proxy: Nginx → porta 3000
- SSL: Certbot auto-renovação
- Repo: github.com/alexandre1804/instapost-lorvix

## Arquivos
```
server.js          ← todas as rotas API
package.json       ← deps: express cors jsonwebtoken node-fetch dotenv
public/index.html  ← frontend completo (única tela)
.gitignore         ← ignora: .env users.json usage.json node_modules/
env.example        ← modelo sem valores
CLAUDE.md          ← este arquivo
```

## .env (só na VPS, nunca no GitHub)
```
JWT_SECRET=
ADMIN_PASS=
ADMIN_EMAIL=
OPENAI_KEY=       ← texto (GPT-4o) + imagem (DALL-E 3) — padrão atual
ANTHROPIC_KEY=    ← opcional
GOOGLE_KEY=       ← opcional
REPLICATE_KEY=    ← opcional
```

## Provedores
| Tipo | Padrão | Variável no server.js |
|------|--------|----------------------|
| Texto | `openai` (GPT-4o) | `const prov = provider || 'openai'` |
| Imagem | `openai_img` (DALL-E 3) | `const imgProv = provider || 'openai_img'` |

Outros suportados: `anthropic`, `google`, `replicate`

## Planos
| Plano | Chaves | Limite |
|-------|--------|--------|
| `basic` | Do `.env` | `BASIC_MONTHLY_LIMIT` (padrão 30/mês) |
| `pro` | Própria do usuário | Ilimitado |
| `admin` | Do `.env` | Ilimitado + stats |

Admin fixo em `CONFIG.ADMIN` no `server.js` (nunca no `users.json`).

## Rotas API
```
POST /api/login              { username, password } → { token, user }
POST /api/register           { name, username, email, password } → { token, user }
GET  /api/me                 → { id, name, username, email, plan, usage, limit }
POST /api/forgot/verify      { username, email } → { ok, userId }
POST /api/forgot/reset       { userId, newPassword } → { token, user }
POST /api/text               { prompt, provider?, userKey? } → { result }
POST /api/image              { prompt, width, height, provider?, userKey? } → { url }
GET  /api/admin/stats        → { month, total_users, total_posts, users[] }
POST /api/admin/set-plan     { userId, plan }
DEL  /api/admin/user/:id
GET  /api/health             → { status:'ok', version:'7.0' }
```

## Frontend — variáveis críticas
```js
const API = 'https://instapost.lorvix.com.br'; // URL do backend
let gerarImgAtivo = true; // toggle imagem no post
const S = {
  post:     { nicho, tipo, tom, estilo, fmt:{w,h}, legenda, hashtags },
  carousel: { nicho, tom, estilo, legenda, hashtags }
}
```

## CSS vars (`:root` no index.html)
```css
--bg: #07131a        /* fundo azul petróleo */
--s1: #111           /* superfície 1 */
--s2: #181818        /* superfície 2 / cards */
--s3: #222           /* superfície 3 / tab ativa */
--border: #2c2c2c
--accent: #c8ff00    /* verde limão — cor principal */
--orange: #ff6b35
--blue: #4fc3f7
--purple: #b388ff
--text: #efefef
--t2: #999
--t3: #555
```

## Funcionalidades implementadas
- Login usuário+senha individual, cadastro público, recuperação de senha
- Toggle "gerar imagem" (post/reel) — desativa para gerar só legenda
- Campo "Descreva a imagem" (opcional) em post e carrossel
- Carrossel: texto do slide embutido no prompt da imagem
- Tom de voz (6), estilo visual (6), formato quadrado/reel
- Plano Pro: campos de chave própria no app
- Barra de uso mensal (basic)
- Painel admin via `/api/admin/stats`

## Comandos VPS
```bash
pm2 status
pm2 logs instapost
pm2 restart instapost
node --check server.js
cd /var/www/instapost && git stash && git pull && pm2 restart instapost
nano /var/www/instapost/.env
cat /var/www/instapost/users.json
cat /var/www/instapost/usage.json
```

## Regras importantes
1. Nunca commitar `.env`, `users.json`, `usage.json`
2. Sempre `node --check server.js` antes de reiniciar
3. Trocar provedor = mudar `server.js` (lógica) + `index.html` (state inicial)
4. Trocar `JWT_SECRET` = todos os usuários precisam logar novamente
5. `git pull` pode falhar com edições diretas na VPS → usar `git stash && git pull`
6. Frontend é arquivo único — HTML + CSS + JS em `public/index.html`
