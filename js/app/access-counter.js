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
  const counterApiEndpoint = `https://api.counterapi.dev/v1/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}/up`;
  const countApiEndpoint = `https://api.countapi.xyz/hit/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;

  wrap.title = `Public access counter (CounterAPI): ${namespace}/${key}`;

  if(protocol === 'file:'){
    valueEl.textContent = 'N/A';
    wrap.title = `Visits disabled on file://. Use http(s) to enable counter.`;
    return;
  }

  valueEl.textContent = '...';
  const fetchFromCounterApi = ()=>{
    return fetch(counterApiEndpoint, { method: 'GET', mode: 'cors', cache: 'no-store' })
      .then((res)=>{
        if(!res.ok) throw new Error(`CounterAPI HTTP ${res.status}`);
        return res.json();
      })
      .then((data)=>{
        const count = Number(data && data.count);
        if(!Number.isFinite(count)) throw new Error('CounterAPI response has no numeric count');
        return { count, provider: 'CounterAPI' };
      });
  };

  const fetchFromCountApi = ()=>{
    return fetch(countApiEndpoint, { method: 'GET', mode: 'cors', cache: 'no-store' })
      .then((res)=>{
        if(!res.ok) throw new Error(`CountAPI HTTP ${res.status}`);
        return res.json();
      })
      .then((data)=>{
        const count = Number(data && data.value);
        if(!Number.isFinite(count)) throw new Error('CountAPI response has no numeric value');
        return { count, provider: 'CountAPI' };
      });
  };

  let retryTimer = null;
  let retryCount = 0;
  const scheduleRetry = ()=>{
    if(retryTimer) return;
    const baseMs = 5000;
    const maxMs = 120000;
    const delay = Math.min(maxMs, baseMs * Math.pow(2, Math.min(retryCount, 6)));
    retryCount += 1;
    retryTimer = setTimeout(()=>{
      retryTimer = null;
      loadCounter();
    }, delay);
  };

  const loadCounter = ()=>{
    fetchFromCounterApi()
      .catch((err1)=>{
        console.warn('[counter] CounterAPI failed, trying CountAPI', err1);
        return fetchFromCountApi().catch((err2)=>{
          const combined = new Error(`${err1 && err1.message ? err1.message : err1} | ${err2 && err2.message ? err2.message : err2}`);
          throw combined;
        });
      })
      .then((result)=>{
        valueEl.textContent = result.count.toLocaleString();
        wrap.title = `Public access counter (${result.provider}): ${namespace}/${key}`;
        retryCount = 0;
      })
      .catch((err)=>{
        console.warn('[counter] failed to fetch', err);
        valueEl.textContent = 'N/A';
        wrap.title = `Counter unavailable (${err && err.message ? err.message : 'network/CORS/ad-block'})`;
        scheduleRetry();
      });
  };

  loadCounter();
})();
