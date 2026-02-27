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

  const host = sanitizeToken(window.location?.hostname, 'local');
  const path = sanitizeToken(window.location?.pathname, 'root');
  const namespace = sanitizeToken(`fact_sim_${host}`, 'fact_sim');
  const key = sanitizeToken(`visits_${path}`, 'visits');
  const counterUpEndpoint = `https://api.counterapi.dev/v1/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}/up`;
  const counterReadEndpoint = `https://api.counterapi.dev/v1/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
  const incrementFlagKey = `fact_sim_counter_incremented_${namespace}_${key}`;
  const localFallbackKey = `fact_sim_counter_local_${namespace}_${key}`;

  wrap.title = `Public access counter (CounterAPI): ${namespace}/${key}`;
  valueEl.textContent = '...';

  const readLocalFallback = ()=>{
    try{
      const raw = window.localStorage ? window.localStorage.getItem(localFallbackKey) : null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    }catch(_e){
      return 0;
    }
  };

  const writeLocalFallback = (n)=>{
    const safe = Math.max(0, Math.floor(Number(n) || 0));
    try{
      if(window.localStorage) window.localStorage.setItem(localFallbackKey, String(safe));
    }catch(_e){}
    return safe;
  };

  const bumpLocalFallback = ()=>{
    const next = readLocalFallback() + 1;
    return writeLocalFallback(next);
  };

  const fetchJson = (url, label)=>{
    return fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' })
      .then((res)=>{
        if(!res.ok){
          const err = new Error(`${label} HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        return res.json();
      });
  };

  const fetchIncrement = ()=>{
    return fetchJson(counterUpEndpoint, 'CounterAPI(up)')
      .then((data)=>{
        const count = Number(data && data.count);
        if(!Number.isFinite(count)) throw new Error('CounterAPI(up) response has no numeric count');
        return { count, provider: 'CounterAPI' };
      });
  };

  const fetchReadOnly = ()=>{
    return fetchJson(counterReadEndpoint, 'CounterAPI(read)')
      .then((data)=>{
        const count = Number(data && data.count);
        if(!Number.isFinite(count)) throw new Error('CounterAPI(read) response has no numeric count');
        return { count, provider: 'CounterAPI' };
      })
      .catch((err)=>{
        // Auto-heal when record does not exist yet.
        if(err && (err.status === 400 || err.status === 404)){
          return fetchIncrement();
        }
        throw err;
      });
  };

  let retryTimer = null;
  let retryCount = 0;
  let retryMode = 'read';
  const scheduleRetry = (mode)=>{
    if(retryTimer) return;
    retryMode = mode || 'read';
    const baseMs = 5000;
    const maxMs = 120000;
    const delay = Math.min(maxMs, baseMs * Math.pow(2, Math.min(retryCount, 6)));
    retryCount += 1;
    retryTimer = setTimeout(()=>{
      retryTimer = null;
      loadCounter(retryMode);
    }, delay);
  };

  let incrementDone = false;
  try{
    incrementDone = window.sessionStorage && window.sessionStorage.getItem(incrementFlagKey) === '1';
  }catch(_e){}

  const renderCount = (count, provider)=>{
    const safe = Math.max(0, Math.floor(Number(count) || 0));
    valueEl.textContent = safe.toLocaleString();
    wrap.title = `Public access counter (${provider}): ${namespace}/${key}`;
  };

  const loadCounter = (mode)=>{
    const shouldIncrement = (mode !== 'read') && !incrementDone;
    const request = shouldIncrement ? fetchIncrement() : fetchReadOnly();

    request
      .then((result)=>{
        const safe = writeLocalFallback(result.count);
        renderCount(safe, result.provider);
        retryCount = 0;
        if(shouldIncrement){
          incrementDone = true;
          try{
            if(window.sessionStorage) window.sessionStorage.setItem(incrementFlagKey, '1');
          }catch(_e){}
        }
      })
      .catch((err)=>{
        console.warn('[counter] failed to fetch, using local fallback', err);
        const localCount = shouldIncrement ? bumpLocalFallback() : readLocalFallback();
        renderCount(localCount, 'local');
        scheduleRetry('read');
      });
  };

  loadCounter(incrementDone ? 'read' : 'increment');
})();
