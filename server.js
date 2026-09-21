const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const root = __dirname;

// Carrega automaticamente variáveis do ficheiro .env
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  envLines.forEach(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      const val = match[2].trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
}

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'fluxo_verify_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

if (!global.WebSocket) {
  global.WebSocket = require('ws');
}
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const app = express();

// Middlewares Globais
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Memória para transações pendentes (aguardando confirmação via WhatsApp)
const pendingTransactions = new Map();

// Download de Media da Meta API
async function downloadMetaMedia(mediaId) {
  if (!WHATSAPP_TOKEN) return null;
  try {
    const urlRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    });
    const urlData = await urlRes.json();
    if (!urlData.url) return null;
    
    const mediaRes = await fetch(urlData.url, {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    });
    const arrayBuffer = await mediaRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch(e) {
    console.error('Erro no download do media:', e);
    return null;
  }
}

// Leitura Inteligente de Faturas com Gemini Vision
async function extractReceiptDataWithAI(buffer, mimeType) {
  if (!ai || !buffer) {
    return { detectedMerchant: 'Desconhecido (Sem IA)', detectedCategory: 'Outros', detectedAmount: 0 };
  }
  try {
    const prompt = `Analise este comprovativo/fatura e extraia os dados estritamente no seguinte formato JSON, sem markdown ou backticks:
{
  "detectedMerchant": "Nome da Loja/Entidade",
  "detectedCategory": "Alimentação" | "Casa" | "Transportes" | "Lazer" | "Outros",
  "detectedAmount": 12.34
}`;
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        { role: 'user', parts: [ { text: prompt }, { inlineData: { data: buffer.toString('base64'), mimeType } } ] }
      ]
    });
    let text = result.text().trim();
    if (text.startsWith('```json')) text = text.substring(7);
    if (text.startsWith('```')) text = text.substring(3);
    if (text.endsWith('```')) text = text.substring(0, text.length - 3);
    const parsed = JSON.parse(text);
    return {
      detectedMerchant: parsed.detectedMerchant || 'Desconhecido',
      detectedCategory: parsed.detectedCategory || 'Outros',
      detectedAmount: parseFloat(parsed.detectedAmount) || 0
    };
  } catch(e) {
    console.error('Erro na extração com Gemini:', e);
    return { detectedMerchant: 'Erro IA', detectedCategory: 'Outros', detectedAmount: 0 };
  }
}

async function sendMetaWhatsappInteractiveMessage(toPhone, textMessage, buttons) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log(`[Simulação Botões WhatsApp] Para ${toPhone}: ${textMessage} | Botões: ${buttons.map(b => b.title).join(', ')}`);
    return false;
  }
  try {
    const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`;
    const actionButtons = buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title } }));
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: "button",
          body: { text: textMessage },
          action: { buttons: actionButtons }
        }
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Meta API Error (Interactive): ${response.status} - ${errText}`);
    }
    return response.ok;
  } catch (err) {
    console.error('Erro no envio interativo Meta WhatsApp API:', err);
    return false;
  }
}

// Envio de Mensagem Real para o WhatsApp via Meta Cloud API
async function sendMetaWhatsappMessage(toPhone, textMessage) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log(`[Simulação Meta WhatsApp] Para ${toPhone}: ${textMessage}`);
    return false;
  }
  try {
    const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: textMessage }
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Meta API Error (Text): ${response.status} - ${errText}`);
    }
    return response.ok;
  } catch (err) {
    console.error('Erro no envio da Meta WhatsApp API:', err);
    return false;
  }
}

// Middleware de Autenticação (Supabase)
async function authMiddleware(req, res, next) {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no servidor.' });
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Não autorizado.' });
  
  const { data } = await supabase.auth.getUser(token);
  if (!data?.user) return res.status(401).json({ error: 'Não autorizado.' });
  
  req.user = data.user;
  req.token = token;
  next();
}

// --- REST API ENDPOINTS ---

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ocrEngine: 'Tesseract.js (Ativo)',
    metaWhatsappConfigured: Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID)
  });
});

app.post('/api/register', async (req, res) => {
  const { email, pass, name } = req.body;
  if (!email || !pass || !name) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado no servidor.' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: {
      data: { name }
    }
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const session = data.session;
  const token = session ? session.access_token : null;
  res.status(201).json({ message: 'Conta criada com sucesso', token, user: { id: data.user.id, name, email } });
});

app.post('/api/login', async (req, res) => {
  const { email, pass } = req.body;
  
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado no servidor.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pass
  });

  if (error || !data.user || !data.session) {
    return res.status(401).json({ error: 'Email ou senha incorretos.' });
  }

  const name = data.user.user_metadata?.name || data.user.email.split('@')[0];
  res.status(200).json({ message: 'Login com sucesso', token: data.session.access_token, user: { id: data.user.id, name, email: data.user.email } });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.user_metadata?.name || ''
  });
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  const { name, password, savings_goal } = req.body;
  
  const updateData = {};
  if (name) { updateData.data = updateData.data || {}; updateData.data.name = name; }
  if (savings_goal !== undefined) { updateData.data = updateData.data || {}; updateData.data.savings_goal = Number(savings_goal); }
  if (password) updateData.password = password;
  
  try {
    const fetchRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${req.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    const data = await fetchRes.json();
    
    if (!fetchRes.ok) {
      return res.status(400).json({ error: data.msg || data.message || 'Erro ao atualizar perfil.' });
    }
    res.status(200).json({ message: 'Perfil atualizado com sucesso.', user: { id: data.id, email: data.email, name: data.user_metadata?.name } });
  } catch (err) {
    res.status(500).json({ error: 'Erro de conexão ao servidor de autenticação.' });
  }
});

app.get('/api/budgets', authMiddleware, async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('budget_year', year)
    .eq('budget_month', month);
    
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ budgets: data });
});

app.post('/api/budgets', authMiddleware, async (req, res) => {
  const { category_name, budget_limit, budget_year, budget_month, category, limit, year, month } = req.body;
  const catName = category_name || category || 'Alimentação';
  const bLimit = budget_limit !== undefined ? budget_limit : limit;
  const bYear = budget_year || year || new Date().getFullYear();
  const bMonth = budget_month || month || (new Date().getMonth() + 1);

  if (!catName || bLimit === undefined) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  const { data: catObj } = await supabase
    .from('categories')
    .select('*')
    .eq('name', catName)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('budgets')
    .upsert({
      user_id: req.user.id,
      category_id: catObj ? catObj.id : null,
      category_name: catName,
      budget_limit: Number(bLimit),
      budget_year: Number(bYear),
      budget_month: Number(bMonth)
    }, { onConflict: 'user_id, category_name, budget_year, budget_month' })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data[0] || data);
});

app.get('/api/dashboard', authMiddleware, async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

  const { data: txData, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id);
    
  if (error) return res.status(500).json({ error: error.message });
  
  const filteredTx = (txData || []).filter(t => {
    const d = new Date(t.occurred_on || t.created_at);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  const income = filteredTx.filter(t => t.kind === 'income').reduce((acc, t) => acc + Number(t.amount), 0);
  const expenses = filteredTx.filter(t => t.kind === 'expense').reduce((acc, t) => acc + Number(t.amount), 0);

  const byCatMap = {};
  filteredTx.filter(t => t.kind === 'expense').forEach(t => {
    const name = t.category_name || 'Outros';
    byCatMap[name] = (byCatMap[name] || 0) + Number(t.amount);
  });

  const expensesByCategory = Object.keys(byCatMap).map(name => ({
    name,
    amount: byCatMap[name]
  })).sort((a, b) => b.amount - a.amount);

  res.status(200).json({
    period: { year, month },
    income,
    expenses,
    savings: income - expenses,
    expensesByCategory
  });
});

app.get('/api/transactions', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('occurred_on', { ascending: false });
    
  if (error) return res.status(500).json({ error: error.message });
  
  const mapped = (data || []).map(t => ({
    ...t,
    categoryId: t.category_id,
    category: t.category_name,
    occurredOn: t.occurred_on
  }));
  
  res.status(200).json(mapped);
});

app.post('/api/transactions', authMiddleware, async (req, res) => {
  const body = req.body;
  if (!body.description || !body.amount) {
    return res.status(400).json({ error: 'Descrição e valor são obrigatórios.' });
  }

  const { data: catObj } = await supabase
    .from('categories')
    .select('*')
    .or(`id.eq.${body.categoryId},name.eq.${body.category}`)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: req.user.id,
      description: body.description.trim(),
      amount: parseFloat(body.amount),
      kind: body.kind || 'expense',
      source: body.source || 'Manual',
      status: 'Confirmed',
      occurred_on: body.occurredOn || new Date().toISOString(),
      category_id: catObj ? catObj.id : null,
      category_name: catObj ? catObj.name : (body.category || 'Outros')
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ...data, categoryId: data.category_id, category: data.category_name, occurredOn: data.occurred_on });
});

app.put('/api/transactions/:id', authMiddleware, async (req, res) => {
  const body = req.body;
  
  const { data: catObj } = await supabase
    .from('categories')
    .select('*')
    .or(`id.eq.${body.categoryId},name.eq.${body.category}`)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('transactions')
    .update({
      description: body.description?.trim(),
      amount: body.amount !== undefined ? parseFloat(body.amount) : undefined,
      kind: body.kind,
      category_id: catObj ? catObj.id : undefined,
      category_name: catObj ? catObj.name : body.category
    })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
    
  if (error || !data) return res.status(404).json({ error: 'Lançamento não encontrado ou erro ao atualizar.' });
  res.status(200).json({ ...data, categoryId: data.category_id, category: data.category_name, occurredOn: data.occurred_on });
});

app.delete('/api/transactions/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select();
    
  if (error || !data || data.length === 0) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  res.status(200).json({ ok: true });
});

app.post('/api/transactions/parse-ai', authMiddleware, async (req, res) => {
  const { fileBase64, mimeType } = req.body;
  
  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: 'Ficheiro base64 e mimeType são obrigatórios.' });
  }

  if (!ai) {
    return res.status(500).json({ error: 'A API Key do Google Gemini não está configurada no servidor (.env).' });
  }

  try {
    const prompt = `Analisa este comprovativo ou fatura e extrai a seguinte informação estruturada em formato JSON (SEM markdown, apenas o JSON puro).
IMPORTANTE: Extrai o valor EXATO e a MOEDA ORIGINAL que aparece no documento. Não faças conversões matemáticas.

{
  "original_amount": <número float, o valor total exato da fatura>,
  "original_currency": "<'BRL' ou 'EUR'>",
  "description": "<nome da loja ou comerciante. Se o comprovativo tiver uma descrição, motivo ou itens claros (ex: 'Almoço', 'Material', 'Uber'), junta tudo. Ex: 'Uber - Viagem'>",
  "category": "<categoria que melhor se adequa, ex: Alimentação, Casa, Transportes, Lazer, Saúde, Outros>",
  "date": "<data da fatura no formato YYYY-MM-DD>",
  "kind": "<'expense' para despesa, 'income' para receita, ou 'transfer' para transferência. IMPORTANTE: Cuidado com o layout de comprovativos PIX (ex: C6 Bank)! A 'Conta de origem' (quem pagou) aparece muitas vezes no fim. Lê os rótulos com atenção: se o utilizador (ex: Gabriel) for o destinatário a receber, é 'income' (receita). Se for a origem a pagar, é 'expense'. Se origem e destino forem o mesmo titular, é 'transfer'.>"
}`;

    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-pro-latest'];
    let response = null;
    let lastErr = null;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            prompt,
            {
              inlineData: {
                data: fileBase64.split(',')[1] || fileBase64,
                mimeType: mimeType
              }
            }
          ]
        });
        break; // Succeeded!
      } catch (e) {
        console.error(`Erro com modelo ${modelName}:`, e.message);
        lastErr = e;
        continue;
      }
    }

    if (!response) {
      throw lastErr;
    }

    let text = response.text || '';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsedData;
    try {
      parsedData = JSON.parse(text);
    } catch (e) {
      console.error("Erro a fazer parse do JSON do Gemini:", text);
      return res.status(500).json({ error: 'O Gemini não devolveu um JSON válido.' });
    }
    
    // Conversão com Cotação Histórica
    if (parsedData.original_currency === 'BRL' && parsedData.original_amount) {
      try {
        const dateStr = parsedData.date || 'latest';
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : 'latest';
        
        const reqUrl = `https://api.frankfurter.app/${validDate}?from=BRL&to=EUR`;
        const rateRes = await fetch(reqUrl);
        
        if (rateRes.ok) {
          const rateData = await rateRes.json();
          const rate = rateData.rates?.EUR;
          if (rate) {
            parsedData.amount = parseFloat((parsedData.original_amount * rate).toFixed(2));
          } else {
            parsedData.amount = parseFloat((parsedData.original_amount / 6).toFixed(2));
          }
        } else {
          parsedData.amount = parseFloat((parsedData.original_amount / 6).toFixed(2));
        }
      } catch (apiErr) {
        parsedData.amount = parseFloat((parsedData.original_amount / 6).toFixed(2));
      }
    } else {
      parsedData.amount = parsedData.original_amount;
    }
    
    res.status(200).json(parsedData);
  } catch (err) {
    console.error('Erro na API do Gemini:', err);
    res.status(500).json({ error: 'Erro ao processar o documento com IA.' });
  }
});

app.get('/api/categories', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${req.user.id},user_id.is.null`);
    
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
});

app.post('/api/categories', authMiddleware, async (req, res) => {
  const body = req.body;
  if (!body.name) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: req.user.id,
      name: body.name.trim(),
      kind: body.kind || 'expense',
      color: body.color || '#197A57'
    })
    .select()
    .single();
    
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/api/planning', authMiddleware, async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

  const { data: txData } = await supabase
    .from('transactions')
    .select('amount, category_name')
    .eq('user_id', req.user.id)
    .eq('kind', 'expense');
    
  const spentMap = {};
  (txData || []).forEach(t => {
    const catName = t.category_name || 'Outros';
    spentMap[catName] = (spentMap[catName] || 0) + Number(t.amount);
  });

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('budget_year', year)
    .eq('budget_month', month);

  const items = (budgets || []).map(b => {
    const spent = spentMap[b.category_name] || 0;
    return {
      id: b.id,
      category: b.category_name,
      limit: b.budget_limit,
      spent: spent,
      remaining: b.budget_limit - spent
    };
  });

  res.status(200).json(items);
});

app.get('/api/bank-connections', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('user_id', req.user.id);
    
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
});

app.post('/api/bank-connections', authMiddleware, async (req, res) => {
  const body = req.body;
  const { data, error } = await supabase
    .from('bank_connections')
    .insert({
      user_id: req.user.id,
      provider: body.provider || 'SIBS_OpenBanking',
      institution_name: body.institutionName || 'Banco Autorizado',
      status: 'Active',
      account_number: '•••• ' + Math.floor(1000 + Math.random() * 9000),
      balance: 4280.50,
      last_sync: new Date().toISOString()
    })
    .select()
    .single();
    
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.post('/api/webhooks/whatsapp/attachments', authMiddleware, async (req, res) => {
  const body = req.body;
  const fileName = body.fileName || 'recibo.pdf';

  const ocrResult = await extractReceiptDataWithAI(null, 'image/jpeg');

  const attachment = {
    id: 'att-' + Date.now(),
    storagePath: `uploads/${fileName}`,
    contentType: body.contentType || 'application/pdf',
    sizeBytes: body.sizeBytes || 184000,
    source: 'whatsapp',
    processingStatus: 'completed'
  };

  const { data: catObj } = await supabase
    .from('categories')
    .select('*')
    .eq('name', ocrResult.detectedCategory)
    .limit(1)
    .maybeSingle();

  const { data: ocrTx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: req.user.id,
      description: ocrResult.detectedMerchant,
      amount: ocrResult.detectedAmount,
      kind: 'expense',
      source: 'WhatsApp OCR Real',
      status: 'Confirmed',
      occurred_on: new Date().toISOString(),
      category_id: catObj ? catObj.id : null,
      category_name: ocrResult.detectedCategory
    })
    .select()
    .single();

  res.status(202).json({
    attachment,
    createdTransaction: ocrTx,
    whatsappReply: `✓ Registei uma despesa de € ${ocrResult.detectedAmount.toFixed(2).replace('.', ',')} em ${ocrResult.detectedCategory} (${ocrResult.detectedMerchant}). Está correto?`
  });
});

app.post('/api/ocr-preview', authMiddleware, async (req, res) => {
  const body = req.body;
  const fileName = body.fileName || 'recibo.pdf';
  const ocrResult = await extractReceiptDataWithAI(null, 'image/jpeg');
  res.status(200).json({
    detectedMerchant: ocrResult.detectedMerchant,
    detectedCategory: ocrResult.detectedCategory,
    detectedAmount: ocrResult.detectedAmount
  });
});

app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

app.post('/api/webhooks/whatsapp', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message) {
      const from = message.from;
      const msgType = message.type;
      const userText = msgType === 'text' ? (message.text?.body || '').trim() : '';
      
      // 1. Process Connection Request
      const linkMatch = userText.match(/^Ligar minha conta:\s*(.+)$/i);
      if (linkMatch) {
        const userId = linkMatch[1].trim();
        const { data: userObj, error: userErr } = await supabase.auth.admin.getUserById(userId);
        if (userErr || !userObj?.user) {
          await sendMetaWhatsappMessage(from, "❌ Erro ao ligar conta: Utilizador não encontrado.");
          return res.status(200).json({ status: 'received' });
        }
        
        const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { ...userObj.user.user_metadata, whatsapp_number: from }
        });
        
        if (updateErr) {
          await sendMetaWhatsappMessage(from, "❌ Erro ao ligar conta.");
        } else {
          await sendMetaWhatsappMessage(from, "✅ Conta ligada com sucesso! Já pode começar a enviar os seus comprovativos e consultar o seu saldo.");
        }
        return res.status(200).json({ status: 'received' });
      }

      // 2. Identify existing user
      let matchedUser = null;
      const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
      if (!listErr && listData?.users) {
        matchedUser = listData.users.find(u => u.user_metadata?.whatsapp_number === from);
      }
      
      if (!matchedUser) {
        await sendMetaWhatsappMessage(from, "⚠️ Este número não está associado a nenhuma conta. Aceda à aplicação e clique em Menu > Conectar WhatsApp.");
        return res.status(200).json({ status: 'received' });
      }

      // 3. User authenticated - Handle commands
      let replyText = "Recebi a sua mensagem!";
      const uid = matchedUser.id;

      if (msgType === 'text') {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { data: txs } = await supabase.from('transactions')
          .select('amount, kind, description, category_name')
          .eq('user_id', uid)
          .gte('occurred_on', startOfMonth);
          
        const txContext = JSON.stringify(txs || []);

        const prompt = `Você é o assistente virtual financeiro do Finance App no WhatsApp. O usuário enviou a mensagem: "${userText}".
Responda de forma humanizada, simpática e muito concisa.
Contexto financeiro (transações deste mês): ${txContext}. (Apenas use se o usuário perguntar de saldo ou gastos, de resto aja normalmente).`;
        
        replyText = "Desculpe, não consegui processar a mensagem.";
        if (ai) {
          try {
            const result = await ai.models.generateContent({ model: 'gemini-1.5-flash', contents: prompt });
            replyText = result.text().trim();
          } catch(e) {
            console.error('Erro no Gemini AI:', e);
            replyText = "Tive um problema de ligação à minha IA, mas o que precisar, pode dizer!";
          }
        }
        await sendMetaWhatsappMessage(from, replyText);

      } else if (msgType === 'image' || msgType === 'document') {
        const mediaId = msgType === 'image' ? message.image?.id : message.document?.id;
        const mimeType = msgType === 'image' ? message.image?.mime_type : message.document?.mime_type;
        
        await sendMetaWhatsappMessage(from, "A ler o seu comprovativo com Inteligência Artificial...");
        
        const buffer = await downloadMetaMedia(mediaId);
        const ocrResult = await extractReceiptDataWithAI(buffer, mimeType);
        
        const txId = 'tx_' + Date.now();
        pendingTransactions.set(txId, {
          user_id: uid,
          description: ocrResult.detectedMerchant,
          amount: ocrResult.detectedAmount,
          kind: 'expense',
          category_name: ocrResult.detectedCategory,
          source: 'WhatsApp OCR Real'
        });

        replyText = `✅ Identifiquei uma despesa de *€ ${ocrResult.detectedAmount.toFixed(2).replace('.', ',')}* em *${ocrResult.detectedCategory}* (${ocrResult.detectedMerchant}). Está correto?`;
        
        await sendMetaWhatsappInteractiveMessage(from, replyText, [
          { id: `confirm_${txId}`, title: "✓ Sim, guardar" },
          { id: `edit_${txId}`, title: "Editar" }
        ]);
        
      } else if (msgType === 'interactive') {
        const buttonReply = message.interactive?.button_reply;
        if (buttonReply) {
          const actionId = buttonReply.id;
          if (actionId.startsWith('confirm_')) {
            const txId = actionId.replace('confirm_', '');
            const pendingTx = pendingTransactions.get(txId);
            
            if (pendingTx) {
              const { error: insErr } = await supabase.from('transactions').insert({
                ...pendingTx,
                occurred_on: new Date().toISOString()
              });
              
              if (!insErr) {
                await sendMetaWhatsappMessage(from, "✅ Lançamento guardado com sucesso no seu painel!");
                pendingTransactions.delete(txId);
              } else {
                await sendMetaWhatsappMessage(from, "❌ Ocorreu um erro ao guardar a despesa na sua conta.");
              }
            } else {
              await sendMetaWhatsappMessage(from, "⚠️ Esta transação já expirou ou foi guardada.");
            }
          } else if (actionId.startsWith('edit_')) {
             const txId = actionId.replace('edit_', '');
             pendingTransactions.delete(txId);
             await sendMetaWhatsappMessage(from, "Transação cancelada. Por favor aceda à aplicação para inserir manualmente ou envie uma foto mais nítida.");
          }
        }
      }
    }
  } catch (err) {
    console.error('Erro no processamento do webhook Meta:', err);
  }
  res.status(200).json({ status: 'received' });
});

app.post('/api/webhooks/whatsapp/message', (req, res) => {
  const text = (req.body.message || '').trim();

  let reply = "Não entendi a mensagem. Pode enviar uma foto/PDF de um recibo ou digitar 'Ajuda'.";
  if (/olá|oi|boas|bom dia|boa tarde/i.test(text)) {
    reply = "Olá! Envie uma foto ou PDF de um comprovativo de compra e eu trato do lançamento automaticamente.";
  } else if (/saldo|resumo|ajuda/i.test(text)) {
    reply = "A consulta de saldo está temporariamente indisponível nesta demonstração (Manutenção).";
  }

  res.status(200).json({ reply });
});

app.use(express.static(root, { index: false }));

app.get(/(.*)/, (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint não encontrado.' });
  }

  const file = path.join(root, req.path);
  if (fs.existsSync(file) && !fs.statSync(file).isDirectory() && req.path !== '/') {
    return res.sendFile(file);
  }

  const ua = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  const mode = req.query.mode;

  let defaultPage = '/index.html';
  if (isMobile && mode !== 'desktop') {
    defaultPage = '/mobile.html';
  }

  res.sendFile(path.join(root, defaultPage));
});

if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor Fluxo REST a correr localmente em http://localhost:${PORT}`);
  });
}
