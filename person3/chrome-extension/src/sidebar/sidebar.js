// ============================================================
// SIDEBAR — renders the full InstaMarket right sidebar
// ============================================================

function createSidebar() {
  const existing = document.getElementById('im-sidebar');
  if (existing) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'im-sidebar';
  sidebar.innerHTML = `
    <div class="im-tab-bar">
      <button class="im-tab active" data-tab="portfolio">Portfolio</button>
      <button class="im-tab" data-tab="markets">Markets</button>
      <button class="im-tab" data-tab="saved">Saved</button>
    </div>

    <!-- PORTFOLIO TAB -->
    <div class="im-tab-content active" id="im-tab-portfolio">
      ${renderPortfolioTab()}
    </div>

    <!-- MARKETS TAB -->
    <div class="im-tab-content" id="im-tab-markets">
      ${renderMarketsTab()}
    </div>

    <!-- SAVED TAB -->
    <div class="im-tab-content" id="im-tab-saved">
      ${renderSavedTab()}
    </div>
  `;

  document.body.appendChild(sidebar);
  bindSidebarEvents();
  drawPayoffCurve();
}

function renderPortfolioTab() {
  const p = MOCK_PORTFOLIO;
  const pnlPos = p.dailyPnl.startsWith('+');

  return `
    <div class="im-portfolio-header">
      <div style="font-size:11px;color:var(--pm-text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Value</div>
      <div class="im-portfolio-value">${p.totalValue}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="${pnlPos ? 'im-arrow-up' : 'im-arrow-down'}"></span>
        <span style="font-size:14px;font-weight:700;color:${pnlPos ? 'var(--pm-green)' : 'var(--pm-red)'};">${p.dailyPnl} today</span>
      </div>
      <div class="im-portfolio-stats">
        <div class="im-stat-box">
          <div class="im-stat-label">Daily P&L</div>
          <div class="im-stat-val ${pnlPos ? 'green' : 'red'}">${p.dailyPnlPct}</div>
        </div>
        <div class="im-stat-box">
          <div class="im-stat-label">Win Rate</div>
          <div class="im-stat-val green">${p.winRate}</div>
        </div>
        <div class="im-stat-box">
          <div class="im-stat-label">Avg Return</div>
          <div class="im-stat-val green">${p.avgReturn}</div>
        </div>
      </div>
    </div>

    <div class="im-chart-wrap">
      <div class="im-chart-title">Payoff Curve</div>
      <canvas class="im-chart-canvas" id="im-payoff-canvas"></canvas>
    </div>

    <div class="im-section-header">Open Positions</div>
    ${p.positions.map(pos => `
      <div class="im-position-row">
        <div class="im-position-info">
          <div class="im-position-title">${pos.title}</div>
          <div class="im-position-meta">
            <span style="color:${pos.side === 'YES' ? 'var(--pm-green)' : 'var(--pm-red)'};">${pos.side}</span>
            &nbsp;·&nbsp;Stake ${pos.stake}
          </div>
        </div>
        <div>
          <div class="im-position-pnl ${pos.positive ? 'pos' : 'neg'}">${pos.pnl}</div>
          <div style="font-size:10px;color:var(--pm-text-secondary);text-align:right;">${pos.pnlPct}</div>
        </div>
      </div>
    `).join('')}

    <div class="im-section-header" style="margin-top:4px;">Bet History</div>
    ${p.history.map(h => `
      <div class="im-position-row">
        <div class="im-position-info">
          <div class="im-position-title">${h.title}</div>
          <div class="im-position-meta">
            <span style="color:${h.side === 'YES' ? 'var(--pm-green)' : 'var(--pm-red)'};">${h.side}</span>
            &nbsp;·&nbsp;${h.stake}&nbsp;·&nbsp;${h.date}
          </div>
        </div>
        <div class="im-position-pnl ${h.positive ? 'pos' : 'neg'}">${h.pnl}</div>
      </div>
    `).join('')}
  `;
}

function renderMarketsTab(activeMarketId) {
  const primary = MOCK_MARKETS.find(m => m.id === (activeMarketId || 'm1')) || MOCK_MARKETS[0];
  const related = primary.relatedMarkets.map(id => MOCK_MARKETS.find(m => m.id === id)).filter(Boolean);

  return `
    ${renderMarketCard(primary, true)}

    <div class="im-section-header">Related Markets</div>
    ${related.map(m => renderMarketCard(m, false)).join('')}

    <div class="im-section-header">AI Agent Analysis</div>
    ${MOCK_AGENTS.map(a => renderAgentCard(a)).join('')}

    <div class="im-section-header">Risk Analysis</div>
    ${renderRiskPanel()}

    <div class="im-section-header">Recommendation</div>
    ${renderRecCard()}

    <div class="im-section-header">Persona Simulation</div>
    ${renderPersonaCards()}

    <button class="im-export-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
      </svg>
      Export as PDF Report
    </button>
  `;
}

function renderMarketCard(market, isBest) {
  return `
    <div class="im-market-card ${isBest ? 'best-match' : ''}">
      ${isBest ? '<div class="im-best-match-badge">⭐ Best Match</div>' : ''}
      <div class="im-market-title">${market.question}</div>
      <div class="im-market-meta">
        <span>${market.volume}</span>
      </div>
      <div class="im-market-odds-row">
        <div class="im-yes-bar-wrap" data-market="${market.id}" data-side="YES">
          <div class="im-bar-fill im-yes-fill" style="width:${market.yesOdds}%"></div>
          <div class="im-bar-label">
            <span class="im-arrow-up"></span>
            YES ${market.yesOdds}%
          </div>
        </div>
        <div class="im-no-bar-wrap" data-market="${market.id}" data-side="NO">
          <div class="im-bar-fill im-no-fill" style="width:${market.noOdds}%"></div>
          <div class="im-bar-label">
            <span class="im-arrow-down"></span>
            NO ${market.noOdds}%
          </div>
        </div>
        <button class="im-card-save-btn" data-market="${market.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function renderAgentCard(agent) {
  return `
    <div class="im-agent-card" id="agent-${agent.id}">
      <div class="im-agent-header" onclick="toggleAgent('${agent.id}')">
        <div class="im-agent-icon ${agent.iconClass}">${agent.iconLabel}</div>
        <div class="im-agent-source">${agent.source}</div>
        <div class="im-agent-insight">${agent.insight}</div>
        <div class="im-agent-expand" id="agent-expand-${agent.id}">▼</div>
      </div>
      <div class="im-agent-reasoning" id="agent-reasoning-${agent.id}">
        ${agent.reasoning.map(r => `
          <div class="im-reasoning-step">
            <span class="step-num">${r.step}.</span>
            <span>${r.text}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderRiskPanel() {
  const risks = Object.values(MOCK_RISK);
  return `
    <div class="im-risk-panel">
      ${risks.map(r => `
        <div class="im-risk-row">
          <div class="im-risk-label-row">
            <span class="im-risk-label">${r.label}</span>
            <span class="im-risk-val">${r.value}%</span>
          </div>
          <div class="im-risk-bar-bg">
            <div class="im-risk-bar-fill im-risk-${r.level}" style="width:${r.value}%"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecCard() {
  const rec = MOCK_RECOMMENDATION;
  return `
    <div class="im-rec-card">
      <div class="im-rec-title">Portfolio Agent Recommendation</div>
      <div class="im-rec-main">Bet YES — ${rec.size}</div>
      <div class="im-rec-sub">${rec.reasoning}</div>
      <div class="im-rec-sub" style="color:var(--pm-yellow);">Hedge: ${rec.hedge}</div>
      <div class="im-rec-actions">
        <button class="im-btn-primary" onclick="showToast('Bet placed: YES $150 ✓')">Confirm Bet</button>
        <button class="im-btn-secondary" onclick="showToast('Saved for later ✓')">Save for Later</button>
      </div>
    </div>
  `;
}

function renderPersonaCards() {
  return `
    ${MOCK_PERSONAS.map(p => `
      <div class="im-persona-card">
        <div class="im-persona-header">
          <div class="im-persona-avatar">${p.emoji}</div>
          <div class="im-persona-name">${p.handle}</div>
          <div class="im-persona-portfolio">${p.portfolioSize}</div>
        </div>
        <div class="im-persona-bet-row">
          <span style="font-size:12px;color:var(--pm-text-secondary);">Simulated bet: <strong style="color:var(--pm-text);">${p.bet}</strong></span>
          <div class="im-persona-outcome ${p.won ? 'won' : 'lost'}">
            <span>${p.won ? '▲' : '▼'}</span>
            ${p.outcome}
          </div>
        </div>
        <div style="font-size:11px;color:var(--pm-text-secondary);">${p.reasoning}</div>
      </div>
    `).join('')}
    <div class="im-agent-disclosure">⚠ Missing context filled arbitrarily by simulation agent. Not financial advice.</div>
  `;
}

function renderSavedTab() {
  return MOCK_SAVED.map(s => `
    <div class="im-saved-row">
      <div class="im-market-title">${s.question}</div>
      <div class="im-market-meta">
        <span>${s.savedAt}</span>
        <span style="margin-left:4px;">· Saved at ${s.savedOdds}% · Now ${s.currentOdds}%</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="im-saved-delta ${s.favorable ? 'up' : 'down'}">
          <span class="${s.favorable ? 'im-arrow-up' : 'im-arrow-down'}"></span>
          ${s.favorable ? '+' : ''}${s.delta}% since saved ${s.favorable ? '(in your favor)' : '(against you)'}
        </div>
        <span style="font-size:11px;color:var(--pm-text-secondary);">${s.volume}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:2px;">
        <button class="im-bet-yes" style="flex:1;justify-content:center;" onclick="showToast('Bet placed: YES ✓')">
          <span class="im-arrow-up"></span> YES ${s.currentOdds}%
        </button>
        <button class="im-bet-no" style="flex:1;justify-content:center;" onclick="showToast('Bet placed: NO ✓')">
          <span class="im-arrow-down"></span> NO ${100 - s.currentOdds}%
        </button>
      </div>
    </div>
  `).join('');
}

function bindSidebarEvents() {
  // Tab switching
  document.querySelectorAll('.im-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.im-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.im-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`im-tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'portfolio') {
        setTimeout(drawPayoffCurve, 50);
      }
    });
  });
}

function toggleAgent(id) {
  const reasoning = document.getElementById(`agent-reasoning-${id}`);
  const expand = document.getElementById(`agent-expand-${id}`);
  if (reasoning) {
    reasoning.classList.toggle('open');
    expand && expand.classList.toggle('open');
  }
}

function drawPayoffCurve() {
  const canvas = document.getElementById('im-payoff-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 340;
  const H = 120;
  canvas.width = W;
  canvas.height = H;

  const data = PAYOFF_CURVE_DATA;
  const maxX = Math.max(...data.map(d => d.x));
  const maxY = Math.max(...data.map(d => d.y));
  const pad = { top: 10, right: 10, bottom: 24, left: 32 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  // Background
  ctx.fillStyle = '#1e2330';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#2a2f3e';
  ctx.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach(pct => {
    const y = pad.top + cH - (pct / 100) * cH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + cW, y);
    ctx.stroke();
    ctx.fillStyle = '#8b92a5';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}%`, pad.left - 4, y + 3);
  });

  // Axes labels
  ctx.fillStyle = '#8b92a5';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ['0', '25', '50', '75', '100'].forEach((label, i) => {
    const x = pad.left + (i / 4) * cW;
    ctx.fillText(`$${label}`, x, H - 6);
  });

  // Gradient fill under curve
  const toX = d => pad.left + (d.x / maxX) * cW;
  const toY = d => pad.top + cH - (d.y / maxY) * cH;

  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, 'rgba(0,200,83,0.3)');
  grad.addColorStop(1, 'rgba(0,200,83,0.02)');

  ctx.beginPath();
  ctx.moveTo(toX(data[0]), pad.top + cH);
  data.forEach(d => ctx.lineTo(toX(d), toY(d)));
  ctx.lineTo(toX(data[data.length - 1]), pad.top + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Curve line
  ctx.beginPath();
  ctx.strokeStyle = '#00c853';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  data.forEach((d, i) => {
    i === 0 ? ctx.moveTo(toX(d), toY(d)) : ctx.lineTo(toX(d), toY(d));
  });
  ctx.stroke();

  // End dot
  const last = data[data.length - 1];
  ctx.beginPath();
  ctx.arc(toX(last), toY(last), 4, 0, Math.PI * 2);
  ctx.fillStyle = '#00c853';
  ctx.fill();
}

function showToast(msg) {
  let toast = document.getElementById('im-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'im-toast';
    toast.className = 'im-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function switchSidebarToMarkets(marketId) {
  const sidebar = document.getElementById('im-sidebar');
  if (!sidebar) createSidebar();

  document.querySelectorAll('.im-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.im-tab-content').forEach(c => c.classList.remove('active'));

  const marketsTab = document.querySelector('.im-tab[data-tab="markets"]');
  const marketsContent = document.getElementById('im-tab-markets');
  if (marketsTab) marketsTab.classList.add('active');
  if (marketsContent) {
    marketsContent.classList.add('active');
    marketsContent.innerHTML = renderMarketsTab(marketId);
  }
}
