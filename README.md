# InstaPost AI

App PWA para geração de conteúdo para Instagram com IA.  
Gera legenda, imagem e hashtags para posts, reels e carrosseis.

**URL:** https://instapost.lorvix.com.br

---

## Estrutura

```
instapost-lorvix/
├── server.js          ← Backend Node.js + Express
├── package.json       ← Dependências
├── env.example        ← Modelo do arquivo .env (copie para .env na VPS)
├── public/
│   └── index.html     ← App frontend (PWA)
└── README.md
```

---

## Configuração na VPS

### 1. Clone o repositório
```bash
cd /var/www
git clone https://github.com/SEU-USUARIO/instapost-lorvix.git instapost
cd instapost
```

### 2. Crie o arquivo .env
```bash
cp env.example .env
nano .env
# Preencha com suas chaves e senhas reais
```

### 3. Instale as dependências
```bash
npm install
```

### 4. Inicie com PM2
```bash
pm2 start server.js --name instapost
pm2 save
pm2 startup
```

---

## Atualizar o app após mudanças

```bash
cd /var/www/instapost
git pull
pm2 restart instapost
```

---

## Adicionar usuários

Edite `server.js`, encontre o array `USERS` e adicione:

```js
{ id: 'u2', username: 'cliente1', name: 'Nome do Cliente', password: 'senha123', plan: 'basic' },
```

Depois reinicie:
```bash
pm2 restart instapost
```

---

## Planos

| Plano | Chaves | Limite |
|-------|--------|--------|
| `basic` | Usa as chaves do servidor | 30 posts/mês (configurável) |
| `pro` | Usuário conecta a própria chave | Ilimitado |
| `admin` | Usa as chaves do servidor | Ilimitado + estatísticas |

---

## Comandos úteis

```bash
pm2 status                    # ver se está rodando
pm2 logs instapost            # ver logs ao vivo
pm2 restart instapost         # reiniciar após editar server.js
cat /var/www/instapost/usage.json  # ver uso mensal por usuário
```
