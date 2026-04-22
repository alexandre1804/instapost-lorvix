require('dotenv').config();

/**
 * InstaPost AI — Backend Server v7
 * Modelo híbrido: Basic (suas chaves) + Pro (chave própria)
 * Novidades: cadastro público, recuperação de senha, painel admin
 */

const CONFIG = {
  PORT: 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'TROQUE_ESTE_SEGREDO_ANTES_DE_USAR',
  BASIC_MONTHLY_LIMIT: 30,
  YOUR_KEYS: {
    anthropic: process.env.ANTHROPIC_KEY || '',
    openai:    process.env.OPENAI_KEY    || '',
    google:    process.env.GOOGLE_KEY    || '',
    replicate: process.env.REPLICATE_KEY || '',
  },
  ADMIN: {
    id:       'admin',
    username: 'admin',
    name:     'Alexandre',
    email:    process.env.ADMIN_EMAIL || 'admin@lorvix.com.br',
    password: process.env.ADMIN_PASS  || 'troque-esta-senha',
    plan:     'admin',
  },
};

const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const fetch   = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = path.join(__dirname, 'users.json');
const USAGE_FILE = path.join(__dirname, 'usage.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
function findUser(fn) {
  if (fn(CONFIG.ADMIN)) return CONFIG.ADMIN;
  return loadUsers().find(fn) || null;
}
function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); }
  catch { return {}; }
}
function saveUsage(d) { fs.writeFileSync(USAGE_FILE, JSON.stringify(d, null, 2)); }
function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function getUserUsage(id) { return loadUsage()?.[id]?.[getMonthKey()] || 0; }
function incrementUsage(id) {
  const u = loadUsage(); const m = getMonthKey();
  if (!u[id]) u[id] = {};
  u[id][m] = (u[id][m] || 0) + 1;
  saveUsage(u);
}
function userPublic(u) {
  return { id: u.id, name: u.name, username: u.username, email: u.email, plan: u.plan,
    usage: getUserUsage(u.id), limit: u.plan === 'basic' ? CONFIG.BASIC_MONTHLY_LIMIT : null };
}

function authMiddleware(req, res, next) {
  const h = req.headers['authorization'];
  if (!h) return res.status(401).json({ error: 'Token não fornecido.' });
  try {
    const d = jwt.verify(h.replace('Bearer ', ''), CONFIG.JWT_SECRET);
    const user = findUser(u => u.id === d.userId);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    req.user = user; next();
  } catch { res.status(401).json({ error: 'Token inválido ou expirado.' }); }
}

// LOGIN
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Preencha usuário e senha.' });
  const user = findUser(u => u.username === username.toLowerCase().trim() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  const token = jwt.sign({ userId: user.id }, CONFIG.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: userPublic(user) });
});

// CADASTRO
app.post('/api/register', (req, res) => {
  const { name, username, email, password } = req.body;
  if (!name || !username || !email || !password)
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });

  const uname  = username.toLowerCase().trim();
  const uemail = email.toLowerCase().trim();
  const exists = findUser(u => u.username === uname || u.email === uemail);
  if (exists) {
    if (exists.username === uname) return res.status(409).json({ error: 'Nome de usuário já em uso.' });
    return res.status(409).json({ error: 'E-mail já cadastrado.' });
  }

  const users = loadUsers();
  const newUser = { id: 'u_' + Date.now(), name: name.trim(), username: uname, email: uemail,
    password, plan: 'basic', createdAt: new Date().toISOString() };
  users.push(newUser);
  saveUsers(users);

  const token = jwt.sign({ userId: newUser.id }, CONFIG.JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: userPublic(newUser) });
});

// ME
app.get('/api/me', authMiddleware, (req, res) => res.json(userPublic(req.user)));

// ESQUECI SENHA — verificar
app.post('/api/forgot/verify', (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) return res.status(400).json({ error: 'Preencha usuário e e-mail.' });
  const user = findUser(u =>
    u.username === username.toLowerCase().trim() && u.email === email.toLowerCase().trim()
  );
  if (!user) return res.status(404).json({ error: 'Usuário ou e-mail não encontrado.' });
  if (user.plan === 'admin') return res.status(403).json({ error: 'Conta admin não pode ser redefinida aqui.' });
  res.json({ ok: true, userId: user.id });
});

// ESQUECI SENHA — redefinir
app.post('/api/forgot/reset', (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) return res.status(400).json({ error: 'Dados incompletos.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Senha mínima de 6 caracteres.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  users[idx].password = newPassword;
  saveUsers(users);
  const token = jwt.sign({ userId }, CONFIG.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: userPublic(users[idx]) });
});

// GERAR TEXTO
app.post('/api/text', authMiddleware, async (req, res) => {
  const { prompt, provider, userKey } = req.body;
  const user = req.user;
  if (user.plan === 'basic' && getUserUsage(user.id) >= CONFIG.BASIC_MONTHLY_LIMIT)
    return res.status(429).json({ error: `Limite de ${CONFIG.BASIC_MONTHLY_LIMIT} posts/mês atingido. Faça upgrade para Pro.` });

  const prov = provider || 'openai';
  const key  = (user.plan !== 'basic' && userKey) ? userKey : CONFIG.YOUR_KEYS[prov];
  if (!key) return res.status(400).json({ error: `Provedor "${prov}" não configurado.` });

  try {
    let result;
    if (prov === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro Anthropic');
      result = d.content.map(i => i.text || '').join('');
    } else if (prov === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro OpenAI');
      result = d.choices[0].message.content;
    } else if (prov === 'google') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro Gemini');
      result = d.candidates[0].content.parts[0].text;
    } else return res.status(400).json({ error: 'Provedor inválido.' });

    incrementUsage(user.id);
    res.json({ result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GERAR IMAGEM
app.post('/api/image', authMiddleware, async (req, res) => {
  const { prompt, width, height, provider, userKey } = req.body;
  const user = req.user;
  const imgProv = provider || 'openai_img';
  const key = (user.plan !== 'basic' && userKey) ? userKey : CONFIG.YOUR_KEYS[imgProv === 'openai_img' ? 'openai' : imgProv];
  if (!key) return res.status(400).json({ error: 'Chave de imagem não configurada.' });

  try {
    let imageUrl;
    if (imgProv === 'replicate') {
      const r = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'wait' },
        body: JSON.stringify({ input: { prompt, width: width || 1024, height: height || 1024, num_outputs: 1, num_inference_steps: 4, output_format: 'jpg', output_quality: 90 } })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Erro Replicate');
      if (d.output?.[0]) { imageUrl = d.output[0]; }
      else {
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const p = await (await fetch(`https://api.replicate.com/v1/predictions/${d.id}`, { headers: { 'Authorization': 'Bearer ' + key } })).json();
          if (p.status === 'succeeded') { imageUrl = p.output[0]; break; }
          if (p.status === 'failed') throw new Error('Replicate: geração falhou.');
        }
      }
    } else if (imgProv === 'openai_img') {
      const size = (width === height) ? '1024x1024' : '1024x1792';
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, quality: 'standard', response_format: 'url' })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro DALL-E');
      imageUrl = d.data[0].url;
    } else return res.status(400).json({ error: 'Provedor de imagem inválido.' });

    if (!imageUrl) throw new Error('Nenhuma imagem gerada.');
    res.json({ url: imageUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN STATS
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  if (req.user.plan !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const users = loadUsers();
  const usage = loadUsage();
  const month = getMonthKey();
  const all = [CONFIG.ADMIN, ...users].map(u => ({
    id: u.id, name: u.name, username: u.username, email: u.email || '—',
    plan: u.plan, usage: usage?.[u.id]?.[month] || 0,
    limit: u.plan === 'basic' ? CONFIG.BASIC_MONTHLY_LIMIT : '∞',
    createdAt: u.createdAt || 'conta fixa',
  }));
  res.json({ month, total_users: users.length, total_posts: all.reduce((a, u) => a + (typeof u.usage === 'number' ? u.usage : 0), 0), users: all });
});

// ADMIN: alterar plano
app.post('/api/admin/set-plan', authMiddleware, (req, res) => {
  if (req.user.plan !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { userId, plan } = req.body;
  if (!['basic','pro','admin'].includes(plan)) return res.status(400).json({ error: 'Plano inválido.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  users[idx].plan = plan;
  saveUsers(users);
  res.json({ ok: true });
});

// ADMIN: excluir usuário
app.delete('/api/admin/user/:id', authMiddleware, (req, res) => {
  if (req.user.plan !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  saveUsers(loadUsers().filter(u => u.id !== req.params.id));
  res.json({ ok: true });
});

// HEALTH
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '7.0' }));

app.listen(CONFIG.PORT, () => {
  console.log(`✦ InstaPost AI Server v7 rodando na porta ${CONFIG.PORT}`);
  console.log(`  Limite básico: ${CONFIG.BASIC_MONTHLY_LIMIT} posts/mês`);
});
