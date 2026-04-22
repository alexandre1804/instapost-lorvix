require('dotenv').config();
/**
 * InstaPost AI — Backend Server
 * Node.js + Express rodando na VPS Hostinger
 *
 * MODELO HÍBRIDO:
 *   - Plano Basic: usa suas chaves (limite de posts/mês configurável)
 *   - Plano Pro: usuário conecta sua própria chave (ilimitado)
 *
 * ARQUITETURA:
 *   App (celular) → HTTPS → Este servidor → Anthropic / Replicate / OpenAI / Google
 */

// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO — edite aqui antes de subir para a VPS
// ════════════════════════════════════════════════════════
const CONFIG = {

  // Porta do servidor (nginx vai fazer proxy para essa porta)
  PORT: 3000,

  // Segredo JWT — troque para uma string longa e aleatória
  JWT_SECRET: process.env.JWT_SECRET || 'TROQUE_ESTE_SEGREDO_ANTES_DE_USAR',

  // Limite de posts por mês para o plano básico
  BASIC_MONTHLY_LIMIT: 30,

  // ── SUAS CHAVES DE API (plano básico) ──────────────────
  // Deixe vazio ('') para desabilitar um provedor
  YOUR_KEYS: {
    anthropic:  process.env.ANTHROPIC_KEY || '',  // sk-ant-...
    openai:     process.env.OPENAI_KEY || '',      // sk-proj-... (opcional)
    google:     process.env.GOOGLE_KEY || '',      // AIza... (opcional)
    replicate:  process.env.REPLICATE_KEY || '', // r8_...
  },

    // ── USUÁRIOS ───────────────────────────────────────────
  // username: login único (sem espaços), name: nome exibido, password: senha individual
  // plan: 'basic' (suas chaves + limite) | 'pro' (chave própria) | 'admin' (sem limite + stats)
  USERS: [
    { id: 'u1', username: 'admin',    name: 'Alexandre', password: process.env.ADMIN_PASS || 'troque-esta-senha', plan: 'admin' },
    // Adicione clientes abaixo:
    // { id: 'u2', username: 'cliente1', name: 'Nome do Cliente', password: 'senha123', plan: 'basic' },
  ],
};

// ════════════════════════════════════════════════════════
// DEPENDÊNCIAS
// ════════════════════════════════════════════════════════
const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const fetch    = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs       = require('fs');
const path     = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // serve o app HTML

// ════════════════════════════════════════════════════════
// STORAGE DE USO (arquivo JSON simples — sem banco de dados)
// ════════════════════════════════════════════════════════
const USAGE_FILE = path.join(__dirname, 'usage.json');

function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); }
  catch { return {}; }
}
function saveUsage(data) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}
function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function getUserUsage(userId) {
  const usage = loadUsage();
  const month = getMonthKey();
  return usage?.[userId]?.[month] || 0;
}
function incrementUsage(userId) {
  const usage = loadUsage();
  const month = getMonthKey();
  if (!usage[userId]) usage[userId] = {};
  usage[userId][month] = (usage[userId][month] || 0) + 1;
  saveUsage(usage);
  return usage[userId][month];
}

// ════════════════════════════════════════════════════════
// MIDDLEWARE DE AUTENTICAÇÃO
// ════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido.' });

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    const user = CONFIG.USERS.find(u => u.id === decoded.userId);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// ════════════════════════════════════════════════════════
// ROTAS
// ════════════════════════════════════════════════════════

// ── LOGIN ────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });

  const user = CONFIG.USERS.find(u => u.username === username.toLowerCase().trim() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  const token = jwt.sign({ userId: user.id }, CONFIG.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id:    user.id,
      name:  user.name,
      username: user.username,
      plan:  user.plan,
      usage: getUserUsage(user.id),
      limit: user.plan === 'basic' ? CONFIG.BASIC_MONTHLY_LIMIT : null,
    }
  });
});

  const user = CONFIG.USERS.find(u => u.password === password);
  if (!user) return res.status(401).json({ error: 'Senha incorreta.' });

  const token = jwt.sign({ userId: user.id }, CONFIG.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id:    user.id,
      name:  user.name,
      plan:  user.plan,
      usage: getUserUsage(user.id),
      limit: user.plan === 'basic' ? CONFIG.BASIC_MONTHLY_LIMIT : null,
    }
  });
});

// ── STATUS DO USUÁRIO ─────────────────────────────────────
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({
    id:    req.user.id,
    name:  req.user.name,
    plan:  req.user.plan,
    usage: getUserUsage(req.user.id),
    limit: req.user.plan === 'basic' ? CONFIG.BASIC_MONTHLY_LIMIT : null,
  });
});

// ── GERAR TEXTO (Claude / GPT / Gemini) ──────────────────
app.post('/api/text', authMiddleware, async (req, res) => {
  const { prompt, provider, userKey } = req.body;
  const user = req.user;

  // Verifica limite no plano basic
  if (user.plan === 'basic') {
    const usage = getUserUsage(user.id);
    if (usage >= CONFIG.BASIC_MONTHLY_LIMIT) {
      return res.status(429).json({
        error: `Limite mensal atingido (${CONFIG.BASIC_MONTHLY_LIMIT} posts). Faça upgrade para o plano Pro ou aguarde o próximo mês.`
      });
    }
  }

  // Determina qual chave usar
  const key = (user.plan !== 'basic' && userKey) ? userKey : CONFIG.YOUR_KEYS[provider || 'anthropic'];
  const prov = provider || 'anthropic';

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
    }

    else if (prov === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro OpenAI');
      result = d.choices[0].message.content;
    }

    else if (prov === 'google') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro Gemini');
      result = d.candidates[0].content.parts[0].text;
    }

    else { return res.status(400).json({ error: 'Provedor de texto inválido.' }); }

    // Incrementa uso apenas no plano basic (pro usa chave própria)
    if (user.plan === 'basic' || user.plan === 'admin') {
      incrementUsage(user.id);
    }

    res.json({ result });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GERAR IMAGEM (Replicate / DALL-E) ────────────────────
app.post('/api/image', authMiddleware, async (req, res) => {
  const { prompt, width, height, provider, userKey } = req.body;
  const user = req.user;

  const imgProvider = provider || 'replicate';
  const key = (user.plan !== 'basic' && userKey) ? userKey : CONFIG.YOUR_KEYS[imgProvider === 'openai_img' ? 'openai' : imgProvider];

  if (!key) return res.status(400).json({ error: `Chave de imagem "${imgProvider}" não configurada.` });

  try {
    let imageUrl;

    if (imgProvider === 'replicate') {
      const r = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'wait' },
        body: JSON.stringify({ input: { prompt, width: width || 1024, height: height || 1024, num_outputs: 1, num_inference_steps: 4, output_format: 'jpg', output_quality: 90 } })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Erro Replicate');

      if (d.output?.[0]) {
        imageUrl = d.output[0];
      } else {
        // Polling
        const predId = d.id;
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const p = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, { headers: { 'Authorization': 'Bearer ' + key } });
          const pd = await p.json();
          if (pd.status === 'succeeded') { imageUrl = pd.output[0]; break; }
          if (pd.status === 'failed') throw new Error('Geração falhou no Replicate.');
        }
      }
    }

    else if (imgProvider === 'openai_img') {
      const size = (width === height) ? '1024x1024' : '1024x1792';
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, quality: 'standard', response_format: 'url' })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Erro DALL-E');
      imageUrl = d.data[0].url;
    }

    else { return res.status(400).json({ error: 'Provedor de imagem inválido.' }); }

    if (!imageUrl) throw new Error('Nenhuma imagem foi gerada.');
    res.json({ url: imageUrl });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PAINEL ADMIN — stats de uso ───────────────────────────
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  if (req.user.plan !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const usage = loadUsage();
  const month = getMonthKey();
  const stats = CONFIG.USERS.map(u => ({
    name:  u.name,
    plan:  u.plan,
    usage: usage?.[u.id]?.[month] || 0,
    limit: u.plan === 'basic' ? CONFIG.BASIC_MONTHLY_LIMIT : '∞',
  }));
  res.json({ month, stats, total: stats.reduce((a, u) => a + u.usage, 0) });
});

// ── HEALTH CHECK ──────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '6.0' }));

// ════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════
app.listen(CONFIG.PORT, () => {
  console.log(`✦ InstaPost AI Server rodando na porta ${CONFIG.PORT}`);
  console.log(`  Usuários: ${CONFIG.USERS.length}`);
  console.log(`  Limite básico: ${CONFIG.BASIC_MONTHLY_LIMIT} posts/mês`);
});
