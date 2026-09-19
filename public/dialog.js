(function() {
  const css = `
    .custom-dialog-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(240, 244, 248, 0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 999999; opacity: 0; pointer-events: none;
      transition: opacity 0.2s ease;
      backdrop-filter: blur(2px);
    }
    .custom-dialog-overlay.show {
      opacity: 1; pointer-events: auto;
    }
    .custom-dialog-box {
      position: relative;
      background: #ffffff;
      border-radius: 16px; 
      padding: 24px;
      width: 90%; max-width: 420px;
      box-shadow: 0 15px 50px rgba(0,0,0,0.06);
      transform: scale(0.95) translateY(10px);
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.5);
    }
    .custom-dialog-overlay.show .custom-dialog-box {
      transform: scale(1) translateY(0);
    }
    
    /* Gradient Backgrounds */
    .custom-dialog-box.error { background: linear-gradient(135deg, #fff0f0 0%, #ffffff 100%); }
    .custom-dialog-box.warning { background: linear-gradient(135deg, #fff8eb 0%, #ffffff 100%); }
    .custom-dialog-box.success { background: linear-gradient(135deg, #ebfbee 0%, #ffffff 100%); }
    .custom-dialog-box.info { background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); }
    
    .custom-dialog-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    .custom-dialog-icon {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: #fff;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    
    .custom-dialog-box.error .custom-dialog-icon { 
      color: #f43f5e; box-shadow: 0 8px 16px rgba(244, 63, 94, 0.25); 
    }
    .custom-dialog-box.warning .custom-dialog-icon { 
      color: #f59e0b; box-shadow: 0 8px 16px rgba(245, 158, 11, 0.25); 
    }
    .custom-dialog-box.success .custom-dialog-icon { 
      color: #10b981; box-shadow: 0 8px 16px rgba(16, 185, 129, 0.25); 
    }
    .custom-dialog-box.info .custom-dialog-icon { 
      color: #3b82f6; box-shadow: 0 8px 16px rgba(59, 130, 246, 0.25); 
    }
    
    .custom-dialog-content {
      flex: 1;
      padding-top: 2px;
      padding-right: 20px;
    }
    .custom-dialog-title {
      font-size: 16px; font-weight: 600; color: #1f2937; margin: 0 0 6px 0;
      font-family: inherit;
    }
    .custom-dialog-message {
      font-size: 14px; color: #6b7280; margin: 0;
      line-height: 1.5; font-family: inherit;
    }
    .custom-dialog-close {
      position: absolute; top: 16px; right: 16px;
      background: none; border: none; color: #9ca3af;
      cursor: pointer; padding: 4px; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .custom-dialog-close:hover { background: rgba(0,0,0,0.05); color: #4b5563; }
    
    .custom-dialog-actions {
      display: flex; justify-content: flex-end; gap: 10px;
      margin-top: 24px;
      padding-left: 56px;
    }
    .custom-dialog-btn {
      padding: 10px 20px; border-radius: 8px; font-weight: 600;
      cursor: pointer; border: none; font-size: 14px; font-family: inherit;
      transition: all 0.2s;
    }
    .custom-dialog-btn.cancel {
      background: transparent; color: #6b7280;
    }
    .custom-dialog-btn.cancel:hover { background: rgba(0,0,0,0.05); color: #374151; }
    .custom-dialog-btn.confirm {
      background: #1f2937; color: #fff;
    }
    .custom-dialog-btn.confirm:hover { background: #111827; box-shadow: 0 4px 12px rgba(17, 24, 39, 0.2); }
    
    /* Specific confirm buttons */
    .custom-dialog-box.error .custom-dialog-btn.confirm { background: #f43f5e; }
    .custom-dialog-box.error .custom-dialog-btn.confirm:hover { background: #e11d48; box-shadow: 0 4px 12px rgba(225, 29, 72, 0.25); }
    
    .custom-dialog-box.warning .custom-dialog-btn.confirm { background: #f59e0b; }
    .custom-dialog-box.warning .custom-dialog-btn.confirm:hover { background: #d97706; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25); }
  `;
  
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  
  const html = `
    <div id="custom-dialog-overlay" class="custom-dialog-overlay">
      <div id="custom-dialog-box" class="custom-dialog-box info">
        <button id="custom-dialog-close" class="custom-dialog-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div class="custom-dialog-header">
          <div id="custom-dialog-icon" class="custom-dialog-icon"></div>
          <div class="custom-dialog-content">
            <h3 id="custom-dialog-title" class="custom-dialog-title">Título</h3>
            <p id="custom-dialog-message" class="custom-dialog-message">Mensagem</p>
          </div>
        </div>
        <div id="custom-dialog-actions" class="custom-dialog-actions">
          <button id="custom-dialog-cancel" class="custom-dialog-btn cancel">Cancelar</button>
          <button id="custom-dialog-ok" class="custom-dialog-btn confirm">Confirmar</button>
        </div>
      </div>
    </div>
  `;
  
  const div = document.createElement('div');
  div.innerHTML = html;
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(div.firstElementChild);
  });
  
  const icons = {
    error: \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>\`,
    warning: \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>\`,
    success: \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>\`,
    info: \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>\`
  };
  
  window.CustomDialog = {
    show: function(message, title, type, isConfirm) {
      return new Promise((resolve) => {
        const overlay = document.getElementById('custom-dialog-overlay');
        const box = document.getElementById('custom-dialog-box');
        const iconEl = document.getElementById('custom-dialog-icon');
        const titleEl = document.getElementById('custom-dialog-title');
        const msgEl = document.getElementById('custom-dialog-message');
        const actionsEl = document.getElementById('custom-dialog-actions');
        const okBtn = document.getElementById('custom-dialog-ok');
        const cancelBtn = document.getElementById('custom-dialog-cancel');
        const closeBtn = document.getElementById('custom-dialog-close');
        
        box.className = 'custom-dialog-box ' + type;
        iconEl.innerHTML = icons[type];
        titleEl.textContent = title;
        msgEl.textContent = message;
        
        if (isConfirm) {
          actionsEl.style.display = 'flex';
          okBtn.textContent = 'Confirmar';
        } else {
          actionsEl.style.display = 'none'; // Alert just uses 'X' to close
        }
        
        const cleanup = () => {
          overlay.classList.remove('show');
          okBtn.removeEventListener('click', onOk);
          cancelBtn.removeEventListener('click', onCancel);
          closeBtn.removeEventListener('click', onCancel);
        };
        
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        
        overlay.classList.add('show');
      });
    },
    alert: function(message, title = "Aviso", type = "error") { 
      return this.show(message, title, type, false); 
    },
    confirm: function(message, title = "Confirmação", type = "warning") { 
      return this.show(message, title, type, true); 
    }
  };
})();
