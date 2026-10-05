// Theme (system · light · dark), stored per device in localStorage.
//
// It must be on <html> BEFORE the first paint, so the layout runs THEME_SCRIPT
// inline in <head>. This store only drives the Theme row in Settings.
// Shared look: ws/app/DESIGN.md.

export type Theme = 'system' | 'light' | 'dark';

const THEME_KEY = 'logi.theme';

/** Status bar color (theme-color), matches --background in globals.css. */
export const BG_LIGHT = '#fafafa';
export const BG_DARK = '#111111';

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: Theme | null = null;

function read(): Theme {
  if (cache !== null) return cache;
  try {
    const raw = localStorage.getItem(THEME_KEY);
    cache = raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    // Safari private mode blocks localStorage.
    cache = 'system';
  }
  return cache;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', dark ? BG_DARK : BG_LIGHT));
}

export const themeStore = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  get: read,
  getServer: (): Theme => 'system',
  set(next: Theme) {
    cache = next;
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
    applyTheme(next);
    listeners.forEach((fn) => fn());
  },
};

/**
 * Runs synchronously in <head> before the first paint, so dark mode never
 * flashes white. The theme-color tags may come after the script, so they are
 * set on DOMContentLoaded. Hand-written ES5: it does not go through the bundler.
 */
export const THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark')return;
document.documentElement.setAttribute('data-theme',t);
document.addEventListener('DOMContentLoaded',function(){
var m=document.querySelectorAll('meta[name="theme-color"]');
for(var i=0;i<m.length;i++)m[i].setAttribute('content',t==='dark'?'${BG_DARK}':'${BG_LIGHT}');
});
}catch(e){}})();`;
