let currentTransactions = [];

function formatAmount(amount, type) {
  const val = Number(amount).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${type === 'income' ? '+' : '-'} € ${val}`;
}

function formatDateNote(dateStr, source) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = isToday ? 'Hoje' : d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  return `${dateFormatted}, ${time} · ${source || 'Manual'}`;
}

function getIcon(kind) {
  return kind === 'income' ? '↗' : '▧';
}

function row(t) {
  const formattedAmount = formatAmount(t.amount, t.kind);
  const note = formatDateNote(t.occurredOn, t.source);
  const icon = getIcon(t.kind);
  return `<div class="transaction-row">
    <div class="category-icon">${icon}</div>
    <div><strong>${t.description}</strong><small>${note}</small></div>
    <span>${t.category || 'Outros'}</span>
    <span class="status">Confirmado</span>
    <b class="amount ${t.kind}">${formattedAmount}</b>
  </div>`;
}

async function renderDashboard() {
  try {
    const dash = await ApiService.getDashboard();
    const balanceElem = document.querySelector('.metric-card.balance strong');
    if (balanceElem) balanceElem.textContent = `€ ${dash.savings.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

    const incomeElem = document.querySelectorAll('.metric-card')[1]?.querySelector('strong');
    if (incomeElem) incomeElem.textContent = `€ ${dash.income.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

    const expenseElem = document.querySelectorAll('.metric-card')[2]?.querySelector('strong');
    if (expenseElem) expenseElem.textContent = `€ ${dash.expenses.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

async function renderTransactions() {
  try {
    currentTransactions = await ApiService.getTransactions();
    const recentElem = document.querySelector('#recent-transactions');
    const allElem = document.querySelector('#all-transactions');

    if (recentElem) recentElem.innerHTML = currentTransactions.slice(0, 3).map(row).join('');
    if (allElem) allElem.innerHTML = currentTransactions.map(row).join('');
  } catch (err) {
    console.error('Erro ao carregar transações:', err);
  }
}

async function renderPlanning() {
  try {
    const budgets = await ApiService.getPlanning();
    const listElem = document.querySelector('.budget-list');
    if (listElem && Array.isArray(budgets)) {
      listElem.innerHTML = budgets.map(b => {
        const pct = Math.min(Math.round((b.spent / b.limit) * 100), 100);
        return `<div>
          <span>${b.category}</span>
          <b>€ ${b.spent.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} <small>de € ${b.limit.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</small></b>
          <i><em style="width:${pct}%"></em></i>
        </div>`;
      }).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar orçamentos:', err);
  }
}

async function loadAllData() {
  await renderDashboard();
  await renderTransactions();
  await renderPlanning();
}

// Navegação de Visões (Views)
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  const target = button.dataset.view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetElem = document.getElementById(target);
  if (targetElem) targetElem.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === target));
  
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = target === 'dashboard' ? 'Bom dia, Clara ✦' : ({
      transactions: 'Lançamentos',
      planning: 'Planeamento',
      reports: 'Relatórios',
      whatsapp: 'WhatsApp',
      accounts: 'Contas bancárias'
    }[target]);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

// Modais
const modal = document.getElementById('modal');
['new-entry', 'new-entry-alt'].forEach(id => document.getElementById(id)?.addEventListener('click', () => modal.classList.add('show')));
const closeBtn = document.getElementById('close-modal');
if (closeBtn) closeBtn.onclick = () => modal.classList.remove('show');
modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });

// Submissão do Formulário de Lançamento (POST /api/transactions)
document.getElementById('entry-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const newTx = {
    description: form.get('description'),
    amount: parseFloat(form.get('amount')),
    kind: form.get('type') || 'expense',
    category: form.get('category'),
    source: 'Manual',
    occurredOn: new Date().toISOString()
  };

  try {
    await ApiService.createTransaction(newTx);
    await loadAllData();
    modal.classList.remove('show');
    showToast('Lançamento guardado com sucesso no servidor.');
    e.target.reset();
  } catch (err) {
    showToast('Erro ao guardar lançamento na API.');
  }
});

// Upload de Comprovativo (Simulação OCR / API /api/webhooks/whatsapp/attachments)
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

uploadZone?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (file) {
    showToast(`Analisando “${file.name}” com OCR...`);
    try {
      const res = await ApiService.uploadAttachment({
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type || 'application/pdf'
      });
      await loadAllData();
      showToast(`“${file.name}” analisado! Lançamento automático criado.`);

      // Adiciona mensagem visual na Central do WhatsApp
      const chatContainer = document.querySelector('.chat');
      if (chatContainer && res.whatsappReply) {
        const fileMsg = document.createElement('div');
        fileMsg.className = 'message user';
        fileMsg.innerHTML = `<span class="file-icon">▧</span><div><b>${file.name}</b><small>PDF / Imagem</small></div><time>${new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})}</time>`;
        chatContainer.appendChild(fileMsg);

        const botReply = document.createElement('div');
        botReply.className = 'message bot success';
        botReply.innerHTML = `${res.whatsappReply} <small>${new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})}</small>`;
        chatContainer.appendChild(botReply);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    } catch (err) {
      showToast('Erro ao processar ficheiro.');
    }
    e.target.value = '';
  }
});

// Chat de Mensagens Interativas WhatsApp
async function sendWaMsg() {
  const input = document.getElementById('wa-text-input');
  if (!input || !input.value.trim()) return;
  const msgText = input.value.trim();
  input.value = '';

  const chatContainer = document.querySelector('.chat');
  if (chatContainer) {
    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    userMsg.textContent = msgText;
    chatContainer.appendChild(userMsg);

    try {
      const res = await ApiService.sendWhatsappMessage(msgText);
      const botMsg = document.createElement('div');
      botMsg.className = 'message bot';
      botMsg.innerHTML = `${res.reply} <small>${new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})} ✓✓</small>`;
      chatContainer.appendChild(botMsg);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (err) {
      console.error(err);
    }
  }
}

document.getElementById('wa-send-btn')?.addEventListener('click', sendWaMsg);
document.getElementById('wa-text-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendWaMsg(); });


function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Open Banking Modal & Conexões Bancárias
const bankModal = document.getElementById('bank-modal');
const closeBankBtn = document.getElementById('close-bank-modal');
const continueBankBtn = document.getElementById('continue-bank');

if (closeBankBtn) closeBankBtn.onclick = () => bankModal?.classList.remove('show');
bankModal?.addEventListener('click', e => { if (e.target === bankModal) bankModal.classList.remove('show'); });

document.getElementById('connect-bank')?.addEventListener('click', () => bankModal?.classList.add('show'));

continueBankBtn?.addEventListener('click', async () => {
  const bankSelect = document.getElementById('bank-select');
  const institutionName = bankSelect ? bankSelect.value : 'Banco Autorizado';
  try {
    showToast(`Autenticando no ${institutionName}...`);
    await ApiService.createBankConnection({ provider: 'SIBS_OpenBanking', institutionName });
    await loadAllData();
    bankModal?.classList.remove('show');
    showToast(`Conta do ${institutionName} conectada com sucesso via Open Banking!`);
  } catch (err) {
    showToast('Erro ao conectar banco.');
  }
});

document.getElementById('revoke-access')?.addEventListener('click', () => showToast('Acesso bancário revogado no servidor.'));


if (new URLSearchParams(window.location.search).get('bank') === 'setup') {
  const accountsElem = document.getElementById('accounts');
  const templateElem = document.getElementById('accounts-setup-template');
  if (accountsElem && templateElem) {
    accountsElem.innerHTML = templateElem.innerHTML;
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    accountsElem.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === 'accounts'));
    document.getElementById('page-title').textContent = 'Contas bancárias';
  }
}

// Inicializa o carregamento de dados da API
document.addEventListener('DOMContentLoaded', loadAllData);
loadAllData();
