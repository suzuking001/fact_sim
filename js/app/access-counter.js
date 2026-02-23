// Public access counter (no account required): CounterAPI v1
var App = window.App || (window.App = {});

(function(){
  const wrap = document.getElementById('accessCounter');
  const valueEl = document.getElementById('accessCounterValue');
  if(!wrap || !valueEl) return;

  const sanitizeToken = (value, fallback)=>{
    const token = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return token || fallback;
  };

  const protocol = String(window.location?.protocol || '').toLowerCase();
  const host = sanitizeToken(window.location?.hostname, 'local');
  const path = sanitizeToken(window.location?.pathname, 'root');
  const namespace = sanitizeToken(`fact_sim_${host}`, 'fact_sim');
  const key = sanitizeToken(`visits_${path}`, 'visits');
  const endpoint = `https://api.counterapi.dev/v1/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}/up`;

  wrap.title = `Public access counter (CounterAPI): ${namespace}/${key}`;

  if(protocol === 'file:'){
    valueEl.textContent = 'N/A';
    return;
  }

  valueEl.textContent = '...';
  fetch(endpoint, { method: 'GET', mode: 'cors', cache: 'no-store' })
    .then((res)=>{
      if(!res.ok) throw new Error(`counter http ${res.status}`);
      return res.json();
    })
    .then((data)=>{
      const count = Number(data && data.count);
      valueEl.textContent = Number.isFinite(count) ? count.toLocaleString() : '-';
    })
    .catch((err)=>{
      console.warn('[counter] failed to fetch', err);
      valueEl.textContent = 'N/A';
    });
})();

