const choices = new Set(['system', 'light', 'dark']);

export function createAppearance({doc = document, win = window, storage = localStorage} = {}) {
  const system = win.matchMedia?.('(prefers-color-scheme: dark)') || {matches: false};
  let account = 'public', preference = 'system',textSize='normal';
  const key = () => 'aesd.appearance.v1.' + account;
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    doc.documentElement.dataset.theme = theme;
    doc.documentElement.dataset.textSize=textSize;
    doc.documentElement.style.colorScheme = theme;
    doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c1410' : '#00843D');
    for (const frame of doc.querySelectorAll('iframe.private-frame')) {
      try { frame.contentDocument.documentElement.dataset.theme = theme;frame.contentDocument.documentElement.dataset.textSize=textSize; } catch { /* Frame not ready. */ }
    }
    return theme;
  }
  function setAccount(id) {
    account = Number.isSafeInteger(id) && id > 0 ? String(id) : 'public';
    try { preference = storage.getItem(key()) || 'system'; } catch { preference = 'system'; }
    if (!choices.has(preference)) preference = 'system';
    try{textSize=storage.getItem('aesd.readability.v1.'+account)==='large'?'large':'normal';}catch{textSize='normal';}
    return apply();
  }
  function set(value) {
    if (!choices.has(value)) throw Error('Görünüm seçimi geçersiz.');
    storage.setItem(key(), value);
    preference = value;
    return apply();
  }
  system.addEventListener?.('change', () => { if (preference === 'system') apply(); });
  win.addEventListener('storage', event => { if (event.key === key()) setAccount(Number(account)); });
  setAccount(null);
  const setTextSize=value=>{if(!['normal','large'].includes(value))throw Error('Yazı boyutu geçersiz.');storage.setItem('aesd.readability.v1.'+account,value);textSize=value;return apply();};
  return {setAccount, set, apply, preference: () => preference,setTextSize,textSize:()=>textSize};
}
