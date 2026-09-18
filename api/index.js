const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Polyfill de WebSocket para Node.js < 22 (evita erro 500 na Vercel e local)
Object.assign(global, { WebSocket });

// Carrega variáveis do ficheiro .env local (para testes locais)
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  envLines.forEach(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
    if (match) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

const app = express();

app.use(cors());
app.use(express.json());

// Verifica se as chaves existem
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// User ID fixo para efeitos de demonstração
const CURRENT_USER_ID = '10000000-0000-0000-0000-000000000001';

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabaseConnected: !!supabase
  });
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || 2026;
    const month = parseInt(req.query.month) || 9;

    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, Category:categories(*)')
      .eq('UserId', CURRENT_USER_ID);

    if (error) throw error;

    const filteredTx = transactions.filter(t => {
      const d = new Date(t.OccurredOn || t.CreatedAt);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    const income = filteredTx.filter(t => t.Kind === 0).reduce((acc, t) => acc + Number(t.Amount), 0); // 0 = Income
    const expenses = filteredTx.filter(t => t.Kind === 1).reduce((acc, t) => acc + Number(t.Amount), 0); // 1 = Expense

    const byCatMap = {};
    filteredTx.filter(t => t.Kind === 1).forEach(t => {
      const name = t.Category?.Name || 'Outros';
      byCatMap[name] = (byCatMap[name] || 0) + Number(t.Amount);
    });

    const expensesByCategory = Object.keys(byCatMap).map(name => ({
      name,
      amount: byCatMap[name]
    })).sort((a, b) => b.amount - a.amount);

    res.json({
      period: { year, month },
      income,
      expenses,
      savings: income - expenses,
      expensesByCategory
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { data, error } = await supabase
    .from('transactions')
    .select('*, Category:categories(*)')
    .eq('UserId', CURRENT_USER_ID)
    .order('OccurredOn', { ascending: false });
  if (error) {
    console.error('Supabase Error:', error);
    return res.status(500).json({ error: error.message, details: error });
  }
  
  // Adaptar o formato para o frontend
  const mapped = data.map(t => ({
    id: t.Id,
    description: t.Description,
    amount: t.Amount,
    kind: t.Kind === 0 ? 'income' : 'expense',
    source: t.Source === 1 ? 'WhatsApp' : (t.Source === 2 ? 'Bank' : 'Manual'),
    status: t.Status === 1 ? 'Confirmed' : (t.Status === 2 ? 'Rejected' : 'Pending'),
    occurredOn: t.OccurredOn,
    categoryId: t.CategoryId,
    category: t.Category?.Name || 'Outros'
  }));

  res.json(mapped);
});

app.post('/api/transactions', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const body = req.body;
  if (!body.description || !body.amount) return res.status(400).json({ error: 'Descrição e valor são obrigatórios.' });

  // Descobrir categoria por ID ou nome
  let catId = body.categoryId;
  if (!catId && body.category) {
    const { data: catData } = await supabase.from('categories').select('Id').eq('Name', body.category).limit(1).single();
    if (catData) catId = catData.Id;
  }

  const newTx = {
    Id: crypto.randomUUID(),
    UserId: CURRENT_USER_ID,
    Description: body.description.trim(),
    Amount: parseFloat(body.amount),
    Kind: body.kind === 'income' ? 0 : 1,
    Source: 0, // Manual
    Status: 1, // Confirmed
    OccurredOn: body.occurredOn ? new Date(body.occurredOn).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    CategoryId: catId || null,
    CreatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase.from('transactions').insert(newTx).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put('/api/transactions/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { id } = req.params;
  const body = req.body;

  const updates = {};
  if (body.description !== undefined) updates.Description = body.description.trim();
  if (body.amount !== undefined) updates.Amount = parseFloat(body.amount);
  if (body.kind !== undefined) updates.Kind = body.kind === 'income' ? 0 : 1;
  if (body.occurredOn !== undefined) updates.OccurredOn = new Date(body.occurredOn).toISOString().split('T')[0];
  if (body.category !== undefined) {
    const { data: catData } = await supabase.from('categories').select('"Id"').eq('Name', body.category).limit(1).single();
    if (catData) updates.CategoryId = catData.Id;
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('Id', id)
    .eq('UserId', CURRENT_USER_ID)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/transactions/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { id } = req.params;

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('Id', id)
    .eq('UserId', CURRENT_USER_ID);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/categories', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { data, error } = await supabase.from('categories').select('*').eq('UserId', CURRENT_USER_ID);
  if (error) return res.status(500).json({ error: error.message });
  const mapped = data.map(c => ({
    id: c.Id,
    name: c.Name,
    kind: c.Kind === 0 ? 'income' : 'expense',
    color: c.Color
  }));
  res.json(mapped);
});

app.get('/api/planning', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const year = parseInt(req.query.year) || 2026;
  const month = parseInt(req.query.month) || 9;

  const [{ data: transactions }, { data: budgets }, { data: categories }] = await Promise.all([
    supabase.from('transactions').select('Amount, CategoryId').eq('UserId', CURRENT_USER_ID).eq('Kind', 1),
    supabase.from('budgets').select('*').eq('UserId', CURRENT_USER_ID).eq('Year', year).eq('Month', month),
    supabase.from('categories').select('Id, Name').eq('UserId', CURRENT_USER_ID)
  ]);

  const spentMap = {};
  transactions?.forEach(t => {
    spentMap[t.CategoryId] = (spentMap[t.CategoryId] || 0) + Number(t.Amount);
  });

  const catMap = {};
  categories?.forEach(c => catMap[c.Id] = c.Name);

  const items = budgets?.map(b => {
    const spent = spentMap[b.CategoryId] || 0;
    return {
      id: b.Id,
      category: catMap[b.CategoryId] || 'Desconhecido',
      limit: b.Limit,
      spent: spent,
      remaining: b.Limit - spent
    };
  }) || [];

  res.json(items);
});

// Código para desenvolvimento local
if (require.main === module) {
  // Serve ficheiros estáticos da pasta public
  app.use(express.static(path.join(__dirname, '../public')));
  
  // Roteamento SPA (Catch-all)
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor local de testes a rodar em http://localhost:${PORT}`);
    console.log(`Use as variáveis do Supabase (URL/KEY) que colocou no ficheiro .env!`);
  });
}

// Exportar como serverless function para Vercel
module.exports = app;
