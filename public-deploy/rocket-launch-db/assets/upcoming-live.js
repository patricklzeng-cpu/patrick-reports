(function () {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const badgeClass = status => {
    if (status === 'go') return 'badge-go';
    if (status === 'tbc' || status === 'hold') return 'badge-tbc';
    return 'badge-tbd';
  };

  const statusLabel = launch => launch.status_raw || ({
    go: 'Go for Launch', tbc: 'To Be Confirmed', tbd: 'To Be Determined',
    hold: 'On Hold', in_flight: 'In Flight', upcoming: 'Upcoming',
  }[launch.status] || launch.status || 'Upcoming');

  const cardHtml = launch => `
    <div class="launch-card" data-family="${esc(launch.vehicle)}" data-status="${esc(launch.status)}" data-provider="${esc(launch.provider)}">
      <div class="card-img-wrap"><img src="${esc(launch.image || './assets/earth_atmos.jpg')}" alt="${esc(launch.vehicle)}" loading="lazy"></div>
      <div class="card-body">
        <div class="card-status ${badgeClass(launch.status)}">${esc(statusLabel(launch))}</div>
        <h3 class="card-title">${esc(launch.name)}</h3>
        <div class="card-meta">
          <span class="card-rocket">${esc(launch.vehicle || 'Unknown')}</span>
          <span class="card-site">🌐 ${esc(launch.site || 'Unknown')}</span>
        </div>
        <div class="card-time">${esc(new Date(launch.net).toISOString().slice(0, 16))} UTC</div>
      </div>
    </div>`;

  function updateFooter(data, visibleCount) {
    const footer = document.querySelector('.footer');
    if (!footer) return;
    footer.innerHTML = `
      <div>📡 数据源: <a href="https://ll.thespacedevs.com/">The Space Devs LL2</a> · ${visibleCount} upcoming missions · 实时按当前时间过滤</div>
      <div>🕒 数据刷新: ${esc(data.generated_at || 'unknown')} · 窗口已过待确认: ${Number(data.pending_confirmation_count || 0)}</div>`;
  }

  function render(data) {
    const container = document.querySelector('.cards-scroll');
    if (!container) return;
    const now = Date.now();
    const launches = (data.records || [])
      .filter(launch => launch.status === 'in_flight' || Date.parse(launch.net) >= now)
      .sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
    container.innerHTML = launches.slice(0, 40).map(cardHtml).join('')
      || '<div style="padding:24px;color:var(--text-2)">暂无已确认的未来发射任务</div>';

    let note = document.getElementById('pending-confirmation-note');
    if (!note) {
      note = document.createElement('div');
      note.id = 'pending-confirmation-note';
      note.style.cssText = 'margin:0 0 12px;color:var(--orange);font-size:12px';
      container.parentNode.insertBefore(note, container);
    }
    const pending = Number(data.pending_confirmation_count || 0);
    note.textContent = pending ? `${pending} 个发射窗口已过，正在等待 LL2 确认结果；它们不会继续冒充 upcoming。` : '';
    note.style.display = pending ? 'block' : 'none';

    updateFooter(data, launches.length);
    if (typeof window.initLaunchCards === 'function') window.initLaunchCards();
  }

  async function refresh() {
    try {
      const response = await fetch('./data/upcoming.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`upcoming.json ${response.status}`);
      const data = await response.json();
      render(data);
    } catch (error) {
      console.warn('[upcoming-live] refresh failed; keeping last rendered data', error);
    }
  }

  refresh();
  setInterval(refresh, 5 * 60 * 1000);
})();

