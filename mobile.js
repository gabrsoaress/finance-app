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
  const icon = isIncome ? '↗' : '↘';
  const amountStr = formatMobileAmount(t.amount, t.kind);
  return `<article class="mobile-transaction ${t.kind}" data-id="${t.id}">
    <span class="trans-icon" style="${isIncome ? 'background:#e4f2e8;color:#278260' : 'background:#fbede5;color:#d87657'}">${icon}</span>
    <div class="tx-desc">
      <strong>${t.description}</strong>
      <small>${formatMobileDate(t.occurredOn, t.source)}</small>
    </div>
    <b class="${t.kind}">${amountStr}</b>
    <div class="mobile-tx-actions">
      <button class="mobile-tx-menu-btn" title="Opções" onclick="window.toggleMobileMenu(event, this)">⋮</button>
      <div class="mobile-tx-menu">
        <button class="mobile-tx-view" onclick="window.openMobileViewModal('${t.id}')"><i data-lucide="eye" style="width:14px; height:14px; margin-right:4px;"></i> Detalhes</button>
        <button class="mobile-tx-edit" onclick="window.openMobileEditModal('${t.id}')"><i data-lucide="pencil" style="width:14px; height:14px; margin-right:4px;"></i> Editar</button>
        <button class="mobile-tx-delete danger" onclick="window.deleteMobileTransaction('${t.id}')"><i data-lucide="trash-2" style="width:14px; height:14px; margin-right:4px;"></i> Excluir</button>
      </div>
    </div>
  </article>`;
}

async function loadMobileData() {
  const auth = localStorage.getItem('auth_user');
  if (!auth) return;
  try {
    let [transactions, dash, budgets] = await Promise.all([
      ApiService.getTransactions(),
      ApiService.getDashboard(),
      ApiService.getPlanning()
    ]);
    if (dash && (dash.error === 'Não autorizado.' || dash.status === 401)) {
      if (localStorage.getItem('auth_user')) {
        localStorage.removeItem('auth_user');
        document.body.classList.add('auth-lock');
        showMobileToast('Sessão expirada. Por favor inicie sessão novamente.');
      }
      return;
    }
    if (!Array.isArray(transactions)) transactions = [];
    if (!dash || dash.error) dash = { income: 0, expenses: 0, savings: 0, expensesByCategory: [] };
    if (!Array.isArray(budgets)) budgets = [];
    currentMobileTransactions = transactions;

    // 1. Atualizar Saldo e Estatísticas do Início
    const balanceElem = document.getElementById('balance-value');
    if (balanceElem && balanceElem.dataset.hidden !== 'true') {
      balanceElem.textContent = `€ ${dash.savings.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const incVal = document.getElementById('home-income-val');
    if (incVal) incVal.textContent = `€ ${dash.income.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

    // Populate Report Accordions
    const repInc = document.getElementById('mob-rep-income');
    const repExp = document.getElementById('mob-rep-expenses');
    const repSav = document.getElementById('mob-rep-savings');
    if (repInc) repInc.textContent = `€ ${dash.income.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
    if (repExp) repExp.textContent = `€ ${dash.expenses.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
    if (repSav) repSav.textContent = `€ ${dash.savings.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

    const rep6mInc = document.getElementById('mob-rep-6m-inc');
    const rep6mExp = document.getElementById('mob-rep-6m-exp');
    const rep6mBal = document.getElementById('mob-rep-6m-bal');

    if (rep6mInc && rep6mExp && rep6mBal) {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      
      let inc6 = 0, exp6 = 0;
      transactions.forEach(t => {
        if (!t.occurredOn) return;
        const d = new Date(t.occurredOn);
        if (d >= sixMonthsAgo) {
          if (t.kind === 'income') inc6 += t.amount;
          if (t.kind === 'expense') exp6 += t.amount;
        }
      });
      
      rep6mInc.textContent = `€ ${inc6.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
      rep6mExp.textContent = `€ ${exp6.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
      rep6mBal.textContent = `€ ${(inc6 - exp6).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
    }

    const expVal = document.getElementById('home-expenses-val');
    if (expVal) expVal.textContent = `€ ${dash.expenses.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

    // 2. Renderizar Lançamentos Recentes no Início
    const homeTxElem = document.getElementById('mobile-transactions');
    if (homeTxElem) {
      homeTxElem.innerHTML = currentMobileTransactions.slice(0, 4).map(mobileTransactionRowMarkup).join('') ||
        '<p style="color:#8a9993;font-size:11px;padding:12px 0;">Sem lançamentos recentes.</p>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
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

    await renderMobileSettings();
  } catch (err) {
    console.error('Erro ao carregar dados mobile:', err);
  }
}

async function renderMobileSettings() {
  const profileForm = document.getElementById('mobile-profile-form');
  if (!profileForm) return;
  try {
    const profile = await ApiService.getProfile();
    if (profile && !profile.error) {
      document.getElementById('mobile-profile-name').value = profile.name || '';
      document.getElementById('mobile-profile-email').value = profile.email || '';
      if (profile.savingsGoal) {
        document.getElementById('mobile-profile-savings').value = profile.savingsGoal;
      }
    }
  } catch (err) {
    console.error('Erro ao carregar perfil mobile:', err);
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
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

window.toggleMobileMenu = function(e, btn) {
  const menu = btn.closest('.mobile-tx-actions').querySelector('.mobile-tx-menu');
  const isOpen = menu?.classList.contains('open');
  document.querySelectorAll('.mobile-tx-menu.open').forEach(m => {
    m.classList.remove('open');
    const row = m.closest('.mobile-transaction');
    if (row) {
      row.style.zIndex = '';
      row.classList.remove('has-menu-open');
    }
  });
  if (!isOpen && menu) {
    menu.classList.add('open');
    const row = menu.closest('.mobile-transaction');
    if (row) {
      row.style.zIndex = '999';
      row.classList.add('has-menu-open');
    }
  }
  e.stopPropagation();
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.mobile-tx-menu')) {
    document.querySelectorAll('.mobile-tx-menu.open').forEach(m => {
      m.classList.remove('open');
      const row = m.closest('.mobile-transaction');
      if (row) {
        row.style.zIndex = '';
        row.classList.remove('has-menu-open');
      }
    });
  }
});

// Modais: Abertura e Fechamento
const entryModal = document.getElementById('mobile-entry-modal');
const editModal = document.getElementById('mobile-edit-modal');
const viewModal = document.getElementById('mobile-view-modal');
const bankModal = document.getElementById('mobile-bank-modal');
const profileModal = document.getElementById('mobile-profile-modal');

document.getElementById('mobile-filter-btn')?.addEventListener('click', () => {
  entryModal?.classList.add('show');
});
document.getElementById('quick-add-manual-btn')?.addEventListener('click', () => entryModal?.classList.add('show'));
document.getElementById('tx-add-manual-btn')?.addEventListener('click', () => entryModal?.classList.add('show'));
document.getElementById('close-entry-modal')?.addEventListener('click', () => entryModal?.classList.remove('show'));

document.getElementById('close-edit-modal')?.addEventListener('click', () => editModal?.classList.remove('show'));
document.getElementById('close-view-modal')?.addEventListener('click', () => viewModal?.classList.remove('show'));

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

// Ver Detalhes do Lançamento
window.openMobileViewModal = function(id) {
  const t = currentMobileTransactions.find(tx => tx.id === id);
  if (!t) return;
  
  document.querySelectorAll('.mobile-tx-menu.open').forEach(m => {
    m.classList.remove('open');
    const row = m.closest('.mobile-transaction');
    if (row) {
      row.style.zIndex = '';
      row.classList.remove('has-menu-open');
    }
  });

  
  document.getElementById('mobile-view-desc').textContent = t.description;
  document.getElementById('mobile-view-amount').textContent = formatMobileAmount(t.amount, t.kind);
  document.getElementById('mobile-view-amount').style.color = t.kind === 'income' ? '#278260' : '#d87657';
  
  document.getElementById('mobile-view-kind').textContent = t.kind === 'income' ? 'Receita' : 'Despesa';
  document.getElementById('mobile-view-kind').style.color = t.kind === 'income' ? '#278260' : '#d87657';
  document.getElementById('mobile-view-kind').style.background = t.kind === 'income' ? '#e4f2e8' : '#fbede5';
  
  document.getElementById('mobile-view-date').textContent = formatMobileDate(t.occurredOn, t.source);
  document.getElementById('mobile-view-cat').textContent = t.category || 'Outros';
  document.getElementById('mobile-view-source').textContent = t.source || 'Manual';
  document.getElementById('mobile-view-status').textContent = t.status || 'Confirmado';
  
  const fileContainer = document.getElementById('mobile-view-file-container');
  const img = document.getElementById('mobile-view-image');
  const pdf = document.getElementById('mobile-view-pdf');
  
  if (t.receipt_url) {
    fileContainer.style.display = 'block';
    if (t.receipt_url.toLowerCase().endsWith('.pdf') || t.receipt_url.startsWith('data:application/pdf')) {
      img.style.display = 'none';
      pdf.style.display = 'flex';
      pdf.href = t.receipt_url;
    } else {
      pdf.style.display = 'none';
      img.style.display = 'block';
      img.src = t.receipt_url;
    }
  } else {
    fileContainer.style.display = 'none';
  }
  
  viewModal?.classList.add('show');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Edição de Lançamento
window.openMobileEditModal = function(id) {
  const t = currentMobileTransactions.find(tx => tx.id === id);
  if (!t) return;
  
  document.querySelectorAll('.mobile-tx-menu.open').forEach(m => {
    m.classList.remove('open');
    const row = m.closest('.mobile-transaction');
    if (row) {
      row.style.zIndex = '';
      row.classList.remove('has-menu-open');
    }
  });
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
window.deleteMobileTransaction = async function(id) {
  document.querySelectorAll('.mobile-tx-menu.open').forEach(m => {
    m.classList.remove('open');
    const row = m.closest('.mobile-transaction');
    if (row) {
      row.style.zIndex = '';
      row.classList.remove('has-menu-open');
    }
  });

  if (!(await window.CustomDialog.confirm('Tem a certeza que quer excluir este lançamento?'))) return;
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
  
  if (!hidden) {
    balance.dataset.hidden = 'true';
    balance.textContent = '€ ••••••••';
    this.innerHTML = '<i data-lucide="eye" style="width:16px; height:16px;"></i>';
  } else {
    balance.dataset.hidden = 'false';
    loadMobileData();
    this.innerHTML = '<i data-lucide="eye-off" style="width:16px; height:16px;"></i>';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

// (Tab logic removed since the new design is unified)

// Upload de Comprovativo OCR
const mobileFileInput = document.getElementById('mobile-file');
document.getElementById('mobile-upload-zone')?.addEventListener('click', () => mobileFileInput?.click());

mobileFileInput?.addEventListener('change', async () => {
  if (mobileFileInput.files[0]) {
    const file = mobileFileInput.files[0];
    const uploadText = document.getElementById('mobile-upload-text');
    const originalText = uploadText ? uploadText.innerHTML : '';
    
    if (uploadText) {
      uploadText.innerHTML = `<span style="color:#00713d; font-weight:600;">A IA está a analisar o documento...</span>`;
    }
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64Str = reader.result;
      try {
        const res = await ApiService.parseAi({
          fileBase64: base64Str,
          mimeType: file.type || 'application/pdf'
        });
        
        if (uploadText) {
          uploadText.innerHTML = `<span style="color:#00713d; font-weight:600;">✓ Fatura lida com sucesso!</span>`;
          setTimeout(() => uploadText.innerHTML = originalText, 3500);
        }
        
        const manualDesc = document.getElementById('manual-desc');
        const manualAmount = document.getElementById('manual-amount');
        const manualKind = document.getElementById('manual-kind');
        const manualCat = document.getElementById('manual-cat');
        
        if (manualDesc) manualDesc.value = res.description || '';
        if (manualAmount && res.amount) manualAmount.value = parseFloat(res.amount).toFixed(2);
        if (manualKind && res.kind) manualKind.value = res.kind;
        if (manualCat && res.category) manualCat.value = res.category;
        
      } catch (err) {
        if (uploadText) {
          uploadText.innerHTML = `<span style="color:#d93025; font-weight:600;">Erro ao analisar. Tente novamente.</span>`;
          setTimeout(() => uploadText.innerHTML = originalText, 3500);
        }
      }
    };
    
    mobileFileInput.value = '';
  }
});

// Redirecionamento para a Versão Desktop
document.getElementById('switch-desktop-btn')?.addEventListener('click', () => {
  window.location.href = '/index.html?mode=desktop';
});

function showMobileToast(message) {
  let type = "info";
  let title = "Informação";
  const msgLower = message.toLowerCase();
  
  if (msgLower.includes('erro') || msgLower.includes('expirada') || msgLower.includes('falha')) {
    type = "error"; title = "Erro";
  } else if (msgLower.includes('sucesso') || msgLower.includes('atualizado') || msgLower.includes('excluído') || msgLower.includes('guardado')) {
    type = "success"; title = "Sucesso";
  }
  
  if (window.CustomDialog && window.CustomDialog.toast) {
    window.CustomDialog.toast(message, title, type);
  } else {
    // fallback
    const toast = document.getElementById('mobile-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
}

function renderMobileCurrentDate() {
  const dateElem = document.getElementById('mobile-current-date');
  if (!dateElem) return;
  const d = new Date();
  dateElem.textContent = d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
}

// Limpar utilizadores locais legados
localStorage.removeItem('finance_app_users');

// Gestão de Sessão & Login/Registo Mobile
let mobileIsRegisterMode = false;
const mobileAuthToggle = document.getElementById('mobile-auth-toggle');
const mobileAuthLabel = document.getElementById('mobile-auth-label');
const mobileAuthTitle = document.getElementById('mobile-auth-title');
const mobileAuthSubmit = document.getElementById('mobile-auth-submit');
const mobileNameLabel = document.getElementById('mobile-auth-name-label');
const mobileNameInput = document.getElementById('mobile-login-name');

if (mobileAuthToggle) {
  mobileAuthToggle.addEventListener('click', (e) => {
    e.preventDefault();
    mobileIsRegisterMode = !mobileIsRegisterMode;
    if (mobileIsRegisterMode) {
      mobileAuthLabel.textContent = 'REGISTO';
      mobileAuthTitle.textContent = 'Criar uma conta';
      mobileAuthSubmit.textContent = 'Registar e Entrar';
      mobileAuthToggle.textContent = 'Já tem conta? Entrar';
      mobileNameLabel.style.display = 'block';
      mobileNameInput.required = true;
    } else {
      mobileAuthLabel.textContent = 'ACESSO';
      mobileAuthTitle.textContent = 'Finance App';
      mobileAuthSubmit.textContent = 'Entrar';
      mobileAuthToggle.textContent = 'Ainda não tem conta? Criar conta';
      mobileNameLabel.style.display = 'none';
      mobileNameInput.required = false;
    }
  });
}

const mobileLoginForm = document.getElementById('mobile-login-form');
if (mobileLoginForm) {
  mobileLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('mobile-login-email').value;
    const pass = document.getElementById('mobile-login-pass').value;
    
    try {
      if (mobileIsRegisterMode) {
        const name = mobileNameInput.value;
        if (!name) {
          await window.CustomDialog.alert('Por favor, introduza o seu nome.');
          return;
        }
        
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, pass })
        });
        
        const data = await res.json();
        if (res.ok) {
          mobileLoginSuccess(data.user, data.token);
        } else {
          await window.CustomDialog.alert(data.error || 'Erro ao criar conta.');
        }
        
      } else {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, pass })
        });
        
        const data = await res.json();
        if (res.ok) {
          mobileLoginSuccess(data.user, data.token);
        } else {
          await window.CustomDialog.alert(data.error || 'Email ou senha incorretos.');
        }
      }
    } catch (err) {
      await window.CustomDialog.alert('Erro de comunicação com o servidor.');
    }
  });
}

function mobileLoginSuccess(user, token) {
  document.body.classList.remove('auth-lock');
  localStorage.setItem('auth_user', JSON.stringify({ name: user.name, token, id: user.id }));
  
  const profileName = document.querySelector('.profile-header-modal h3');
  if (profileName) profileName.textContent = user.name;
  
  const homeTitle = document.querySelector('.mobile-header h1');
  if (homeTitle) homeTitle.innerHTML = `Olá, ${user.name.split(' ')[0]}`;
  
  document.querySelectorAll('.profile-photo').forEach(el => {
    el.textContent = user.name.charAt(0).toUpperCase();
  });
  
  showMobileToast(`Sessão iniciada como ${user.name}.`);
  loadMobileData();
}

const savedAuthUserStr = localStorage.getItem('auth_user');
if (savedAuthUserStr) {
  try {
    const savedAuthUser = JSON.parse(savedAuthUserStr);
    document.body.classList.remove('auth-lock');
    const profileName = document.querySelector('.profile-header-modal h3');
    if (profileName) profileName.textContent = savedAuthUser.name;
    const homeTitle = document.querySelector('.mobile-header h1');
    if (homeTitle) homeTitle.innerHTML = `Olá, ${savedAuthUser.name.split(' ')[0]}`;
    document.querySelectorAll('.profile-photo').forEach(el => {
      el.textContent = savedAuthUser.name.charAt(0).toUpperCase();
    });
  } catch (e) {
    localStorage.removeItem('auth_user');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderMobileCurrentDate();
  loadMobileData();

  // Report Cards Accordion Logic
  document.querySelectorAll('.mobile-report-cards article').forEach(card => {
    const header = card.querySelector('.card-header');
    if (header) {
      header.addEventListener('click', () => {
        card.classList.toggle('expanded');
      });
    }
  });

  // Logout Mobile
  const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', async () => {
      if (await window.CustomDialog.confirm('Tem a certeza que deseja terminar a sessão?')) {
        localStorage.removeItem('auth_user');
        window.location.reload();
      }
    });
  }

  const mobileProfileForm = document.getElementById('mobile-profile-form');
  if (mobileProfileForm) {
    mobileProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('mobile-profile-msg');
      const name = document.getElementById('mobile-profile-name').value;
      const savingsGoal = document.getElementById('mobile-profile-savings').value;
      const password = document.getElementById('mobile-profile-password').value;

      try {
        msg.textContent = 'A guardar...';
        msg.style.color = '#197a57';
        
        const payload = { name };
        if (savingsGoal !== '') {
          payload.savingsGoal = parseFloat(savingsGoal);
        }
        if (password) {
          payload.password = password;
        }

        const res = await ApiService.updateProfile(payload);
        if (res.error) {
          msg.textContent = res.error;
          msg.style.color = 'red';
        } else {
          msg.textContent = 'Perfil atualizado com sucesso!';
          document.getElementById('mobile-profile-password').value = '';
          const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
          if (res.user) {
            authUser.name = res.user.name;
            localStorage.setItem('auth_user', JSON.stringify(authUser));
            document.querySelectorAll('.profile-photo').forEach(el => {
              el.textContent = authUser.name.charAt(0).toUpperCase();
            });
            const profileName = document.querySelector('.profile-header-modal h3');
            if (profileName) profileName.textContent = authUser.name;
            const homeTitle = document.querySelector('.mobile-header h1');
            if (homeTitle) homeTitle.innerHTML = `Olá, ${authUser.name.split(' ')[0]} <span>✦</span>`;
          }
          setTimeout(() => msg.textContent = '', 3000);
        }
      } catch (err) {
        msg.textContent = 'Erro ao atualizar perfil.';
        msg.style.color = 'red';
      }
    });
  }

  // Inicializar Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});
loadMobileData();
