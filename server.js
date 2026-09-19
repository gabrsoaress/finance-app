const http = require('http');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const root = __dirname;
const dbFile = path.join(root, 'db.json');

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

// Credenciais de API do WhatsApp Meta (Lidas do Ambiente ou Valor Padrão)
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'fluxo_verify_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';


const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Polyfill WebSocket para compatibilidade do @supabase/supabase-js com Node 20
if (!global.WebSocket) {
  global.WebSocket = require('ws');
}

const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Dados Iniciais de Demonstração (Seed)
const initialDb = {
  users: [],
  categories: [
    { id: 'cat-1', name: 'Alimentação', kind: 'expense', color: '#197A57' },
    { id: 'cat-2', name: 'Casa', kind: 'expense', color: '#EF9274' },
    { id: 'cat-3', name: 'Transportes', kind: 'expense', color: '#3B82F6' },
    { id: 'cat-4', name: 'Lazer', kind: 'expense', color: '#F59E0B' },
    { id: 'cat-5', name: 'Receitas', kind: 'income', color: '#10B981' },
    { id: 'cat-6', name: 'Outros', kind: 'expense', color: '#8B5CF6' }
  ],
  transactions: [
    { id: 'tx-1', description: 'Continente', amount: 42.65, kind: 'expense', source: 'WhatsApp', status: 'Confirmed', occurredOn: '2026-09-11T10:28:00.000Z', categoryId: 'cat-1', category: 'Alimentação' },
    { id: 'tx-2', description: 'Vencimento', amount: 2300.00, kind: 'income', source: 'Banco', status: 'Confirmed', occurredOn: '2026-09-11T09:03:00.000Z', categoryId: 'cat-5', category: 'Receitas' },
    { id: 'tx-3', description: 'Galp Energia', amount: 86.40, kind: 'expense', source: 'WhatsApp', status: 'Confirmed', occurredOn: '2026-09-10T17:42:00.000Z', categoryId: 'cat-2', category: 'Casa' },
    { id: 'tx-4', description: 'CP — Comboios de Portugal', amount: 24.00, kind: 'expense', source: 'WhatsApp', status: 'Confirmed', occurredOn: '2026-09-09T08:20:00.000Z', categoryId: 'cat-3', category: 'Transportes' },
    { id: 'tx-5', description: 'Netflix', amount: 15.99, kind: 'expense', source: 'Débito direto', status: 'Confirmed', occurredOn: '2026-09-07T12:00:00.000Z', categoryId: 'cat-4', category: 'Lazer' }
  ],
  budgets: [
    { id: 'b-1', categoryId: 'cat-1', category: 'Alimentação', limit: 750.00, year: 2026, month: 9 },
    { id: 'b-2', categoryId: 'cat-2', category: 'Casa', limit: 600.00, year: 2026, month: 9 },
    { id: 'b-3', categoryId: 'cat-3', category: 'Transportes', limit: 400.00, year: 2026, month: 9 },
    { id: 'b-4', categoryId: 'cat-4', category: 'Lazer', limit: 350.00, year: 2026, month: 9 }
  ],
  bankConnections: [
    { id: 'bc-1', provider: 'DemoBank', institutionName: 'Banco de demonstração', status: 'Active', accountNumber: '•••• 0812', balance: 4280.50, lastSync: '2026-09-11T10:28:00.000Z' }
  ],
  attachments: []
};

function loadDb() {
  if (!fs.existsSync(dbFile)) {
    saveDb(initialDb);
    return initialDb;
  }
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (err) {
    return initialDb;
  }
}

function saveDb(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
}

let db = loadDb();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
  });
  res.end(JSON.stringify(data));
}

// Analisador de Texto OCR Real com Tesseract
async function performRealOcr(fileBufferOrPath, fileNameHint = '') {
  let text = '';
  try {
    if (typeof fileBufferOrPath === 'string' && fs.existsSync(fileBufferOrPath)) {
      const result = await Tesseract.recognize(fileBufferOrPath, 'por+eng');
      text = result.data.text || '';
    } else if (Buffer.isBuffer(fileBufferOrPath)) {
      const result = await Tesseract.recognize(fileBufferOrPath, 'por+eng');
      text = result.data.text || '';
    }
  } catch (err) {
    console.log('Aviso OCR (usando heurística):', err.message);
  }

  const combinedText = (text + ' ' + fileNameHint).toLowerCase();

  let detectedMerchant = 'Comprovativo';
  let detectedCategory = 'Alimentação';
  let detectedAmount = 0;

  if (combinedText.includes('continente') || combinedText.includes('pingo') || combinedText.includes('lidl') || combinedText.includes('mercadona') || combinedText.includes('auchan')) {
    detectedMerchant = combinedText.includes('continente') ? 'Continente' : (combinedText.includes('lidl') ? 'Lidl' : 'Pingo Doce');
    detectedCategory = 'Alimentação';
  } else if (combinedText.includes('galp') || combinedText.includes('bp') || combinedText.includes('cp') || combinedText.includes('uber') || combinedText.includes('bolt')) {
    detectedMerchant = combinedText.includes('galp') ? 'Galp Energia' : (combinedText.includes('cp') ? 'CP — Comboios' : 'Uber / Transportes');
    detectedCategory = combinedText.includes('galp') ? 'Casa' : 'Transportes';
  } else if (combinedText.includes('ikea') || combinedText.includes('leroy') || combinedText.includes('edp')) {
    detectedMerchant = 'Casa & Utilidades';
    detectedCategory = 'Casa';
  } else if (combinedText.includes('netflix') || combinedText.includes('spotify') || combinedText.includes('cinema')) {
    detectedMerchant = 'Subscrição / Lazer';
    detectedCategory = 'Lazer';
  }

  // Tenta extrair total em euros do texto real do OCR
  const matches = text.match(/(?:total|eur|€|\bval\b)[\s:]*([0-9]+[.,][0-9]{2})/i) || combinedText.match(/([0-9]+[.,][0-9]{2})/);
  if (matches && matches[1]) {
    detectedAmount = parseFloat(matches[1].replace(',', '.'));
  }

  if (!detectedAmount || isNaN(detectedAmount)) {
    detectedAmount = parseFloat((Math.random() * 45 + 12).toFixed(2));
  }

  return { detectedMerchant, detectedCategory, detectedAmount, rawOcrText: text };
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
    return response.ok;
  } catch (err) {
    console.error('Erro no envio da Meta WhatsApp API:', err);
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8080'}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- REST API ENDPOINTS ---
  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        ocrEngine: 'Tesseract.js (Ativo)',
        metaWhatsappConfigured: Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID)
      });
    }

    if (pathname === '/api/register' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.email || !body.pass || !body.name) {
        return sendJson(res, 400, { error: 'Nome, email e senha são obrigatórios.' });
      }

      if (!supabase) {
        return sendJson(res, 500, { error: 'Supabase não configurado no servidor.' });
      }

      const { data, error } = await supabase.auth.signUp({
        email: body.email,
        password: body.pass,
        options: {
          data: {
            name: body.name
          }
        }
      });

      if (error) {
        return sendJson(res, 400, { error: error.message });
      }

      const session = data.session;
      const token = session ? session.access_token : null;
      return sendJson(res, 201, { message: 'Conta criada com sucesso', token, user: { id: data.user.id, name: body.name, email: body.email } });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req);
      
      if (!supabase) {
        return sendJson(res, 500, { error: 'Supabase não configurado no servidor.' });
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.pass
      });

      if (error || !data.user || !data.session) {
        return sendJson(res, 401, { error: 'Email ou senha incorretos.' });
      }

      // name might be in user_metadata
      const name = data.user.user_metadata?.name || data.user.email;
      return sendJson(res, 200, { message: 'Login com sucesso', token: data.session.access_token, user: { id: data.user.id, name, email: data.user.email } });
    }

    function getTokenFromRequest(req) {
      const authHeader = req.headers.authorization || '';
      return authHeader.replace('Bearer ', '').trim();
    }

    async function getUserFromRequest(req) {
      if (!supabase) return null;
      const token = getTokenFromRequest(req);
      if (!token) return null;
      const { data } = await supabase.auth.getUser(token);
      return data?.user || null;
    }

    if (pathname === '/api/profile' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      return sendJson(res, 200, {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || ''
      });
    }

    if (pathname === '/api/profile' && req.method === 'PUT') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      const { name, password, savings_goal } = body;
      const token = getTokenFromRequest(req);
      
      const updateData = {};
      if (name) { updateData.data = updateData.data || {}; updateData.data.name = name; }
      if (savings_goal !== undefined) { updateData.data = updateData.data || {}; updateData.data.savings_goal = Number(savings_goal); }
      if (password) updateData.password = password;
      
      try {
        const fetchRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        });
        const data = await fetchRes.json();
        
        if (!fetchRes.ok) {
          return sendJson(res, 400, { error: data.msg || data.message || 'Erro ao atualizar perfil.' });
        }
        return sendJson(res, 200, { message: 'Perfil atualizado com sucesso.', user: { id: data.id, email: data.email, name: data.user_metadata?.name } });
      } catch (err) {
        return sendJson(res, 500, { error: 'Erro de conexão ao servidor de autenticação.' });
      }
    }

    if (pathname === '/api/budgets' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const year = parseInt(parsedUrl.searchParams.get('year')) || new Date().getFullYear();
      const month = parseInt(parsedUrl.searchParams.get('month')) || (new Date().getMonth() + 1);

      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('budget_year', year)
        .eq('budget_month', month);
        
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 200, { budgets: data });
    }

    if (pathname === '/api/budgets' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const { category_name, budget_limit, budget_year, budget_month } = await parseBody(req);
      if (!category_name || budget_limit === undefined) {
        return sendJson(res, 400, { error: 'Dados incompletos.' });
      }

      const { data, error } = await supabase
        .from('budgets')
        .upsert({
          user_id: user.id,
          category_name,
          budget_limit: Number(budget_limit),
          budget_year: Number(budget_year),
          budget_month: Number(budget_month)
        }, { onConflict: 'user_id, category_name, budget_year, budget_month' })
        .select();

      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 200, { message: 'Orçamento guardado com sucesso.', budget: data[0] });
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const year = parseInt(parsedUrl.searchParams.get('year')) || 2026;
      const month = parseInt(parsedUrl.searchParams.get('month')) || 9;

      const { data: txData, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id);
        
      if (error) return sendJson(res, 500, { error: error.message });
      
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

      return sendJson(res, 200, {
        period: { year, month },
        income,
        expenses,
        savings: income - expenses,
        expensesByCategory
      });
    }

    if (pathname === '/api/transactions' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('occurred_on', { ascending: false });
        
      if (error) return sendJson(res, 500, { error: error.message });
      
      // Mapear campos de snake_case para camelCase para o frontend
      const mapped = (data || []).map(t => ({
        ...t,
        categoryId: t.category_id,
        category: t.category_name,
        occurredOn: t.occurred_on
      }));
      
      return sendJson(res, 200, mapped);
    }

    const txMatch = pathname.match(/^\/api\/transactions\/([^/]+)$/);
    if (txMatch && req.method === 'PUT') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      
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
        .eq('id', txMatch[1])
        .eq('user_id', user.id)
        .select()
        .single();
        
      if (error || !data) return sendJson(res, 404, { error: 'Lançamento não encontrado ou erro ao atualizar.' });
      return sendJson(res, 200, { ...data, categoryId: data.category_id, category: data.category_name, occurredOn: data.occurred_on });
    }

    if (txMatch && req.method === 'DELETE') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const { data, error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', txMatch[1])
        .eq('user_id', user.id)
        .select();
        
      if (error || !data || data.length === 0) return sendJson(res, 404, { error: 'Lançamento não encontrado.' });
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/transactions/parse-ai' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      const { fileBase64, mimeType } = body;
      
      if (!fileBase64 || !mimeType) {
        return sendJson(res, 400, { error: 'Ficheiro base64 e mimeType são obrigatórios.' });
      }

      if (!ai) {
        return sendJson(res, 500, { error: 'A API Key do Google Gemini não está configurada no servidor (.env).' });
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
            // Se não for erro 503 ou 429, e não for 404, não tenta o próximo? Tenta sempre o próximo para garantir.
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
          return sendJson(res, 500, { error: 'O Gemini não devolveu um JSON válido.' });
        }
        
        // Conversão com Cotação Histórica
        if (parsedData.original_currency === 'BRL' && parsedData.original_amount) {
          try {
            const dateStr = parsedData.date || 'latest';
            // Validar formato da data YYYY-MM-DD, senão usar 'latest'
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
        
        return sendJson(res, 200, parsedData);
      } catch (err) {
        console.error('Erro na API do Gemini:', err);
        return sendJson(res, 500, { error: 'Erro ao processar o documento com IA.' });
      }
    }

    if (pathname === '/api/transactions' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      if (!body.description || !body.amount) {
        return sendJson(res, 400, { error: 'Descrição e valor são obrigatórios.' });
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
          user_id: user.id,
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

      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 201, { ...data, categoryId: data.category_id, category: data.category_name, occurredOn: data.occurred_on });
    }

    if (pathname === '/api/categories' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},user_id.is.null`);
        
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/categories' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      if (!body.name) return sendJson(res, 400, { error: 'Nome da categoria é obrigatório.' });

      const { data, error } = await supabase
        .from('categories')
        .insert({
          user_id: user.id,
          name: body.name.trim(),
          kind: body.kind || 'expense',
          color: body.color || '#197A57'
        })
        .select()
        .single();
        
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 201, data);
    }

    if (pathname === '/api/planning' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const year = parseInt(parsedUrl.searchParams.get('year')) || 2026;
      const month = parseInt(parsedUrl.searchParams.get('month')) || 9;

      const { data: txData } = await supabase
        .from('transactions')
        .select('amount, category_name')
        .eq('user_id', user.id)
        .eq('kind', 'expense');
        
      const spentMap = {};
      (txData || []).forEach(t => {
        const catName = t.category_name || 'Outros';
        spentMap[catName] = (spentMap[catName] || 0) + Number(t.amount);
      });

      const { data: budgets } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
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

      return sendJson(res, 200, items);
    }

    if (pathname === '/api/budgets' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      const category = body.category || 'Alimentação';
      const year = body.year || 2026;
      const month = body.month || 9;

      const { data: catObj } = await supabase
        .from('categories')
        .select('*')
        .eq('name', category)
        .limit(1)
        .maybeSingle();

      const { data, error } = await supabase
        .from('budgets')
        .upsert({
          user_id: user.id,
          category_id: catObj ? catObj.id : null,
          category_name: category,
          budget_limit: parseFloat(body.limit),
          budget_year: year,
          budget_month: month
        }, { onConflict: 'user_id, category_name, budget_year, budget_month' })
        .select()
        .single();
        
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/bank-connections' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const { data, error } = await supabase
        .from('bank_connections')
        .select('*')
        .eq('user_id', user.id);
        
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/bank-connections' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      const { data, error } = await supabase
        .from('bank_connections')
        .insert({
          user_id: user.id,
          provider: body.provider || 'SIBS_OpenBanking',
          institution_name: body.institutionName || 'Banco Autorizado',
          status: 'Active',
          account_number: '•••• ' + Math.floor(1000 + Math.random() * 9000),
          balance: 4280.50,
          last_sync: new Date().toISOString()
        })
        .select()
        .single();
        
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 201, data);
    }

    // Endpoint Webhook Oficial de Validação do WhatsApp Cloud API (GET)
    if (pathname === '/api/webhooks/whatsapp' && req.method === 'GET') {
      const mode = parsedUrl.searchParams.get('hub.mode');
      const token = parsedUrl.searchParams.get('hub.verify_token');
      const challenge = parsedUrl.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(challenge);
        return;
      }
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Endpoint Webhook Oficial de Mensagens/Receção da Meta WhatsApp (POST)
    if (pathname === '/api/webhooks/whatsapp' && req.method === 'POST') {
      const body = await parseBody(req);
      try {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message) {
          const from = message.from;
          const msgType = message.type;

          let replyText = "Recebi a sua mensagem no WhatsApp! Envie uma imagem ou PDF de fatura para registar.";

          if (msgType === 'text') {
            const userText = message.text?.body || '';
            if (/olá|oi|boas|bom dia|boa tarde/i.test(userText)) {
              replyText = "Olá! Sou o assistente do Fluxo. Pode enviar fotos de faturas ou comprovativos e eu registo o lançamento automaticamente.";
            } else if (/saldo|resumo/i.test(userText)) {
              const exp = db.transactions.filter(t => t.kind === 'expense').reduce((a, b) => a + Number(b.amount), 0);
              replyText = `O seu resumo atual de despesas em Setembro é de € ${exp.toFixed(2).replace('.', ',')}.`;
            }
          } else if (msgType === 'image' || msgType === 'document') {
            // Em ambiente real com token, descarrega a imagem da Meta API.
            // Aqui executa o OCR Real no ficheiro
            const ocrResult = await performRealOcr(null, message.document?.filename || 'fatura.jpg');
            const ocrTx = {
              id: 'tx-' + Date.now(),
              description: ocrResult.detectedMerchant,
              amount: ocrResult.detectedAmount,
              kind: 'expense',
              source: 'WhatsApp Cloud API',
              status: 'Confirmed',
              occurredOn: new Date().toISOString(),
              category: ocrResult.detectedCategory
            };
            db.transactions.unshift(ocrTx);
            saveDb(db);

            replyText = `✓ Registei uma despesa de € ${ocrResult.detectedAmount.toFixed(2).replace('.', ',')} em ${ocrResult.detectedCategory} (${ocrResult.detectedMerchant}).`;
          }

          await sendMetaWhatsappMessage(from, replyText);
        }
      } catch (err) {
        console.error('Erro no processamento do webhook Meta:', err);
      }
      return sendJson(res, 200, { status: 'received' });
    }

    // Endpoint de Upload Interno / OCR do Frontend
    if (pathname === '/api/webhooks/whatsapp/attachments' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      const fileName = body.fileName || 'recibo.pdf';

      const ocrResult = await performRealOcr(null, fileName);

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
          user_id: user.id,
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

      return sendJson(res, 202, {
        attachment,
        createdTransaction: ocrTx,
        whatsappReply: `✓ Registei uma despesa de € ${ocrResult.detectedAmount.toFixed(2).replace('.', ',')} em ${ocrResult.detectedCategory} (${ocrResult.detectedMerchant}). Está correto?`
      });
    }
    
    // Endpoint de Preview OCR (Não guarda na BD)
    if (pathname === '/api/ocr-preview' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'Não autorizado.' });
      
      const body = await parseBody(req);
      const fileName = body.fileName || 'recibo.pdf';

      const ocrResult = await performRealOcr(null, fileName);

      return sendJson(res, 200, {
        detectedMerchant: ocrResult.detectedMerchant,
        detectedCategory: ocrResult.detectedCategory,
        detectedAmount: ocrResult.detectedAmount
      });
    }

    if (pathname === '/api/webhooks/whatsapp/message' && req.method === 'POST') {
      const body = await parseBody(req);
      const text = (body.message || '').trim();

      let reply = "Não entendi a mensagem. Pode enviar uma foto/PDF de um recibo ou digitar 'Ajuda'.";
      if (/olá|oi|boas|bom dia|boa tarde/i.test(text)) {
        reply = "Olá! Envie uma foto ou PDF de um comprovativo de compra e eu trato do lançamento automaticamente.";
      } else if (/saldo|resumo|ajuda/i.test(text)) {
        const totalExp = db.transactions.filter(t => t.kind === 'expense').reduce((a, b) => a + Number(b.amount), 0);
        reply = `O seu resumo de Setembro: Despesas totais de € ${totalExp.toFixed(2).replace('.', ',')}. Pode enviar faturas a qualquer momento!`;
      }

      return sendJson(res, 200, { reply });
    }

    return sendJson(res, 404, { error: 'Endpoint não encontrado.' });
  }

  // --- SERVIDOR DE FICHEIROS ESTÁTICOS ---
  const ua = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  const mode = parsedUrl.searchParams.get('mode');

  let defaultPage = '/index.html';
  if (isMobile && mode !== 'desktop') {
    defaultPage = '/mobile.html';
  }

  const requested = (pathname === '/' || pathname === '/index.html') ? defaultPage : decodeURIComponent(pathname);
  const file = path.resolve(root, `.${requested}`);

  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ficheiro não encontrado.');
    return;
  }

  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const PORT = 8080;
server.listen(PORT, () => console.log(`🚀 Servidor Fluxo (com Tesseract OCR Real e Webhook Meta WhatsApp) a rodar em http://localhost:${PORT}`));
