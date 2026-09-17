// Camada de API para Comunicação Frontend <-> Backend REST
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8080/api'
  : '/api';

const ApiService = {
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  },

  async getDashboard(year = 2026, month = 9) {
    const res = await fetch(`${API_BASE}/dashboard?year=${year}&month=${month}`);
    return await res.json();
  },

  async getTransactions() {
    const res = await fetch(`${API_BASE}/transactions`);
    return await res.json();
  },

  async createTransaction(transaction) {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction)
    });
    return await res.json();
  },

  async getCategories() {
    const res = await fetch(`${API_BASE}/categories`);
    return await res.json();
  },

  async getPlanning(year = 2026, month = 9) {
    const res = await fetch(`${API_BASE}/planning?year=${year}&month=${month}`);
    return await res.json();
  },

  async updateBudget(budget) {
    const res = await fetch(`${API_BASE}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budget)
    });
    return await res.json();
  },

  async getBankConnections() {
    const res = await fetch(`${API_BASE}/bank-connections`);
    return await res.json();
  },

  async createBankConnection(bankData) {
    const res = await fetch(`${API_BASE}/bank-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bankData)
    });
    return await res.json();
  },

  async uploadAttachment(attachmentData) {
    const res = await fetch(`${API_BASE}/webhooks/whatsapp/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attachmentData)
    });
    return await res.json();
  },

  async sendWhatsappMessage(message) {
    const res = await fetch(`${API_BASE}/webhooks/whatsapp/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    return await res.json();
  }
};

window.ApiService = ApiService;

