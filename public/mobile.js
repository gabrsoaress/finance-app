let currentMobileTransactions = [];
let currentMobileFilter = 'all';

function formatMobileAmount(amount, type) {
  const val = Number(amount).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${type === 'income' ? '+' : '-'} € ${val}`;
}

function formatMobileDate(dateStr, source) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = isToday ? 'Hoje' : d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  return `${dateFormatted}, ${time} · ${source || 'Manual'}`;
}

function mobileTransactionRowMarkup(t) {
  const isIncome = t.kind === 'income';
  const icon = isIncome ? '↗' : '▧';
  const amountStr = formatMobileAmount(t.amount, t.kind);
  return `<article class="mobile-transaction ${t.kind}" data-id="${t.id}">
    <span class="trans-icon" style="${isIncome ? 'background:#e4f2e8;color:#278260' : 'background:#fbede5;color:#d87657'}">${icon}</span>
    <div>
      <strong>${t.description}</strong>
      <small>${formatMobileDate(t.occurredOn, t.source)}</small>
    </div>
    <b class="${t.kind}">${amountStr}</b>
    <div class="mobile-tx-actions">
      <button class="mobile-tx-menu-btn" data-id="${t.id}" title="Opções">⋮</button>
      <div class="mobile-tx-menu" id="mobile-menu-${t.id}">
        <button class="mobile-tx-view" data-id="${t.id}">👁 Detalhes</button>
        <button class="mobile-tx-edit" data-id="${t.id}">✏️ Editar</button>
        <button class="mobile-tx-delete danger" data-id="${t.id}">🗑 Excluir</button>
      </div>
    </div>
  </article>`;
}

async function loadMobileData() {
  try {
    const [transactions, dash, budgets] = await Promise.all([
      ApiService.getTransactions(),
      ApiService.getDashboard(),
      ApiService.getPlanning()
    ]);
    currentMobileTransactions = Array.isArray(transactions) ? transactions : [];

    // 1. Atualizar Saldo e Estatísticas do Início
    const balanceElem = document.getElementById('balance-value');
    if (balanceElem && !balanceElem.dataset.hidden) {
      balanceElem.textContent = `€ ${dash.savings.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const incVal = document.getElementById('home-income-val');
    if (incVal) incVal.textContent = `€ ${dash.income.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
    const expVal = document.getElementById('home-expenses-val');
    if (expVal) expVal.textContent = `€ ${dash.expenses.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

    // 2. Renderizar Lançamentos Recentes no Início
    const homeTxElem = document.getElementById('mobile-transactions');
    if (homeTxElem) {
      homeTxElem.innerHTML = currentMobileTransactions.slice(0, 4).map(mobileTransactionRowMarkup).join('') ||
        '<p style="color:#8a9993;font-size:11px;padding:12px 0;">Sem lançamentos recentes.</p>';
    }

    // 3. Renderizar Lançamentos com Filtro na Aba Movimentos
    renderFilteredTransactions();

    // 4. Renderizar Categorias no Início
    const catList = document.getElementById('home-categories-list');
    if (catList && dash.expensesByCategory) {
      const colors = ['food', 'home', 'move'];
      const icons = ['⌘', '⌂', '⌁'];
      const totalExp = dash.expenses || 1;
      catList.innerHTML = dash.expensesByCategory.map((cat, i) => {
        const pct = Math.round((cat.amount / totalExp) * 100);
        return `<article class="category-card ${colors[i % 3]}">
          <i>${icons[i % 3]}</i>
          <span>${cat.name}</span>
          <b>€ ${Number(cat.amount).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</b>
          <small>${pct}% do total</small>
        </article>`;
      }).join('');
    }

    // 5. Renderizar Orçamentos no Planeamento
    const budgetsElem = document.getElementById('mobile-budgets-container');
    if (budgetsElem && Array.isArray(budgets)) {
      budgetsElem.innerHTML = budgets.map(b => {
        const pct = Math.min(100, Math.round((b.spent / b.limit) * 100));
        return `<div>
          <div><span>${b.category}</span><b>€ ${b.spent.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} <small>/ € ${b.limit.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</small></b></div>
          <i><em class="${pct > 85 ? 'amber' : ''}" style="width:${pct}%"></em></i>
        </div>`;
      }).join('');
    }

  } catch (err) {
    console.error('Erro ao carregar dados mobile:', err);
  }
}

function renderFilteredTransactions() {
  const allTxElem = document.getElementById('all-mobile-transactions');
  if (!allTxElem) return;

  let list = currentMobileTransactions;
  if (currentMobileFilter === 'income') list = list.filter(t => t.kind === 'income');
  if (currentMobileFilter === 'expense') list = list.filter(t => t.kind === 'expense');

  allTxElem.innerHTML = list.map(mobileTransactionRowMarkup).join('') ||
    '<p style="color:#8a9993;font-size:11px;padding:15px 0;text-align:center;">Nenhum lançamento encontrado nesta categoria.</p>';
}

// Navegação entre Vistas Mapeadas
function switchMobilePage(page) {
  document.querySelectorAll('.mobile-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`${page}-view`);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.bottom-nav button').forEach(nav => {
    nav.classList.toggle('active', nav.dataset.page === page);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    switchMobilePage(btn.dataset.page);
  });
});

// Filtros de Chips em Movimentos
document.querySelectorAll('.chip-filter').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    currentMobileFilter = chip.dataset.filter;
    renderFilteredTransactions();
  });
});

// Event Delegation para Menus e Opções nos Lançamentos Móveis
document.addEventListener('click', (e) => {
  const menuBtn = e.target.closest('.mobile-tx-menu-btn');
  if (menuBtn) {
    const id = menuBtn.dataset.id;
    const menu = document.getElementById(`mobile-menu-${id}`);
    const isOpen = menu?.classList.contains('open');
    document.querySelectorAll('.mobile-tx-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu?.classList.add('open');
    e.stopPropagation();
    return;
  }

  if (e.target.closest('.mobile-tx-view')) {
    const id = e.target.closest('.mobile-tx-view').dataset.id;
    const t = currentMobileTransactions.find(tx => tx.id === id);
    if (t) {
      showMobileToast(`${t.description} · € ${Number(t.amount).toFixed(2)} · ${t.category}`);
    }
    document.querySelectorAll('.mobile-tx-menu.open').forEach(m => m.classList.remove('open'));
    return;
  }

  if (e.target.closest('.mobile-tx-edit')) {
    const id = e.target.closest('.mobile-tx-edit').dataset.id;
    openMobileEditModal(id);
    document.querySelectorAll('.mobile-tx-menu.open').forEach(m => m.classList.remove('open'));
    return;
  }

  if (e.target.closest('.mobile-tx-delete')) {
    const id = e.target.closest('.mobile-tx-delete').dataset.id;
    deleteMobileTransaction(id);
    document.querySelectorAll('.mobile-tx-menu.open').forEach(m => m.classList.remove('open'));
    return;
  }

  if (!e.target.closest('.mobile-tx-menu')) {
    document.querySelectorAll('.mobile-tx-menu.open').forEach(m => m.classList.remove('open'));
  }
});

// Modais: Abertura e Fechamento
const entryModal = document.getElementById('mobile-entry-modal');
const editModal = document.getElementById('mobile-edit-modal');
const bankModal = document.getElementById('mobile-bank-modal');
const profileModal = document.getElementById('mobile-profile-modal');

document.getElementById('quick-add-manual-btn')?.addEventListener('click', () => entryModal?.classList.add('show'));
document.getElementById('tx-add-manual-btn')?.addEventListener('click', () => entryModal?.classList.add('show'));
document.getElementById('close-entry-modal')?.addEventListener('click', () => entryModal?.classList.remove('show'));

document.getElementById('close-edit-modal')?.addEventListener('click', () => editModal?.classList.remove('show'));

document.getElementById('open-bank-modal-btn')?.addEventListener('click', () => bankModal?.classList.add('show'));
document.getElementById('mobile-connect-another-bank')?.addEventListener('click', () => bankModal?.classList.add('show'));
document.getElementById('close-bank-modal')?.addEventListener('click', () => bankModal?.classList.remove('show'));

document.getElementById('open-profile-btn')?.addEventListener('click', () => profileModal?.classList.add('show'));
document.getElementById('close-profile-modal')?.addEventListener('click', () => profileModal?.classList.remove('show'));

[entryModal, editModal, bankModal, profileModal].forEach(m => {
  m?.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('show');
  });
});

// Submissão do Formulário de Criação Manual (Modal ou Aba)
async function handleCreateSubmit(e, form) {
  e.preventDefault();
  const desc = form.querySelector('[name="description"]')?.value || form.querySelector('#manual-desc')?.value;
  const amount = parseFloat(form.querySelector('[name="amount"]')?.value || form.querySelector('#manual-amount')?.value);
  const kind = form.querySelector('[name="type"]')?.value || form.querySelector('#manual-kind')?.value || 'expense';
  const category = form.querySelector('[name="category"]')?.value || form.querySelector('#manual-cat')?.value || 'Outros';

  if (!desc || !amount) return;

  try {
    await ApiService.createTransaction({
      description: desc.trim(),
      amount,
      kind,
      category,
      source: 'Mobile',
      occurredOn: new Date().toISOString()
    });
    await loadMobileData();
    entryModal?.classList.remove('show');
    form.reset();
    showMobileToast('Lançamento guardado com sucesso.');
    switchMobilePage('transactions');
  } catch (err) {
    showMobileToast('Erro ao guardar lançamento.');
  }
}

document.getElementById('mobile-entry-form')?.addEventListener('submit', (e) => handleCreateSubmit(e, e.target));
document.getElementById('mobile-direct-form')?.addEventListener('submit', (e) => handleCreateSubmit(e, e.target));

// Edição de Lançamento
function openMobileEditModal(id) {
  const t = currentMobileTransactions.find(tx => tx.id === id);
  if (!t) return;
  document.getElementById('mobile-edit-id').value = t.id;
  document.getElementById('mobile-edit-desc').value = t.description;
  document.getElementById('mobile-edit-amount').value = t.amount;
  document.getElementById('mobile-edit-kind').value = t.kind;
  document.getElementById('mobile-edit-cat').value = t.category || 'Outros';
  editModal?.classList.add('show');
}

document.getElementById('mobile-edit-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('mobile-edit-id').value;
  const updates = {
    description: document.getElementById('mobile-edit-desc').value,
    amount: parseFloat(document.getElementById('mobile-edit-amount').value),
    kind: document.getElementById('mobile-edit-kind').value,
    category: document.getElementById('mobile-edit-cat').value
  };
  try {
    await ApiService.updateTransaction(id, updates);
    await loadMobileData();
    editModal?.classList.remove('show');
    showMobileToast('Lançamento atualizado.');
  } catch (err) {
    showMobileToast('Erro ao atualizar lançamento.');
  }
});

// Eliminar Lançamento
async function deleteMobileTransaction(id) {
  if (!confirm('Tem a certeza que quer excluir este lançamento?')) return;
  try {
    await ApiService.deleteTransaction(id);
    await loadMobileData();
    showMobileToast('Lançamento excluído.');
  } catch (err) {
    showMobileToast('Erro ao excluir lançamento.');
  }
}

// Conexão Open Banking no Mobile
document.getElementById('mobile-confirm-bank')?.addEventListener('click', async () => {
  const bankSelect = document.getElementById('mobile-bank-select');
  const institutionName = bankSelect ? bankSelect.value : 'Banco Autorizado';
  try {
    showMobileToast(`Autenticando no ${institutionName}...`);
    await ApiService.createBankConnection({ provider: 'SIBS_OpenBanking', institutionName });
    await loadMobileData();
    bankModal?.classList.remove('show');
    showMobileToast(`Conta do ${institutionName} ligada com sucesso!`);
  } catch (err) {
    showMobileToast('Erro ao ligar conta bancária.');
  }
});

// Ocultar / Mostrar Saldo
document.getElementById('hide-balance')?.addEventListener('click', function () {
  const balance = document.getElementById('balance-value');
  if (!balance) return;
  const hidden = balance.dataset.hidden === 'true';
  balance.dataset.hidden = !hidden;
  if (!hidden) {
    balance.textContent = '€ ••••••••';
  } else {
    loadMobileData();
  }
  this.textContent = hidden ? '◉' : '◌';
});

// Alternar entre abas OCR vs Manual na tela de Registo
const tabOcr = document.getElementById('tab-ocr');
const tabManual = document.getElementById('tab-manual');
const ocrSec = document.getElementById('ocr-section');
const manualSec = document.getElementById('manual-section');

tabOcr?.addEventListener('click', () => {
  tabOcr.classList.add('active');
  tabManual?.classList.remove('active');
  if (ocrSec) ocrSec.style.display = 'block';
  if (manualSec) manualSec.style.display = 'none';
});

tabManual?.addEventListener('click', () => {
  tabManual.classList.add('active');
  tabOcr?.classList.remove('active');
  if (ocrSec) ocrSec.style.display = 'none';
  if (manualSec) manualSec.style.display = 'block';
});

// Upload de Comprovativo OCR
const mobileFileInput = document.getElementById('mobile-file');
document.getElementById('mobile-upload')?.addEventListener('click', () => mobileFileInput?.click());
document.getElementById('choose-file')?.addEventListener('click', () => mobileFileInput?.click());

mobileFileInput?.addEventListener('change', async () => {
  if (mobileFileInput.files[0]) {
    const file = mobileFileInput.files[0];
    showMobileToast(`“${file.name}” recebido. Processando com OCR...`);
    try {
      await ApiService.uploadAttachment({
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type || 'application/pdf'
      });
      await loadMobileData();
      showMobileToast(`“${file.name}” processado! Lançamento registado.`);
      switchMobilePage('transactions');
    } catch (err) {
      showMobileToast('Erro ao processar ficheiro no servidor.');
    }
    mobileFileInput.value = '';
  }
});

// Redirecionamento para a Versão Desktop
document.getElementById('switch-desktop-btn')?.addEventListener('click', () => {
  window.location.href = '/index.html?mode=desktop';
});

function showMobileToast(message) {
  const toast = document.getElementById('mobile-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function renderMobileCurrentDate() {
  const dateElem = document.getElementById('mobile-current-date');
  if (!dateElem) return;
  const d = new Date();
  dateElem.textContent = d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
}

document.addEventListener('DOMContentLoaded', () => {
  renderMobileCurrentDate();
  loadMobileData();
});
loadMobileData();
