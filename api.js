// Camada de API para Comunicação Frontend <-> Backend REST
const API_BASE = '/api';

function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  try {
    const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
    if (authUser && authUser.token) {
      headers['Authorization'] = `Bearer ${authUser.token}`;
    }
  } catch (e) {
    console.error('Erro ao ler token do localStorage', e);
  }
  return headers;
}

// Compatibilidade caso algum trecho chame getHeaders()
function getHeaders(customHeaders = {}) {
  return getAuthHeaders(customHeaders);
}

const ApiService = {
  getAuthHeaders,
  getHeaders,

  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  },

  async getDashboard(year = 2026, month = 9) {
    const res = await fetch(`${API_BASE}/dashboard?year=${year}&month=${month}`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async getTransactions() {
    const res = await fetch(`${API_BASE}/transactions`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async createTransaction(transaction) {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(transaction)
    });
    return await res.json();
  },

  async getCategories() {
    const res = await fetch(`${API_BASE}/categories`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async getPlanning(year = 2026, month = 9) {
    const res = await fetch(`${API_BASE}/planning?year=${year}&month=${month}`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async updateBudget(budget) {
    const res = await fetch(`${API_BASE}/budgets`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(budget)
    });
    return await res.json();
  },

  async getBankConnections() {
    const res = await fetch(`${API_BASE}/bank-connections`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async createBankConnection(bankData) {
    const res = await fetch(`${API_BASE}/bank-connections`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(bankData)
    });
    return await res.json();
  },

  async uploadAttachment(attachmentData) {
    const res = await fetch(`${API_BASE}/webhooks/whatsapp/attachments`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(attachmentData)
    });
    return await res.json();
  },

  async parseAi(payload) {
    const res = await fetch(`${API_BASE}/transactions/parse-ai`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async ocrPreview(attachmentData) {
    const res = await fetch(`${API_BASE}/ocr-preview`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(attachmentData)
    });
    return await res.json();
  },

  async sendWhatsappMessage(message) {
    const res = await fetch(`${API_BASE}/webhooks/whatsapp/message`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message })
    });
    return await res.json();
  },

  async deleteTransaction(id) {
    const res = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async updateTransaction(id, data) {
    const res = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async getProfile() {
    const res = await fetch(`${API_BASE}/profile`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async updateProfile(data) {
    const res = await fetch(`${API_BASE}/profile`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async getBudgets(year, month) {
    const res = await fetch(`${API_BASE}/budgets?year=${year}&month=${month}`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  },

  async saveBudget(data) {
    const res = await fetch(`${API_BASE}/budgets`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    return await res.json();
  }
};

window.ApiService = ApiService;
