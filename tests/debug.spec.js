// @ts-check
const { test, expect } = require('@playwright/test');

test('diagnostico completo del login y carga de datos', async ({ page }) => {
  const logs = [];
  const errors = [];

  // Capturar consola del navegador
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`BROWSER ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    errors.push(err.message);
    console.error('PAGE ERROR:', err.message);
  });
  page.on('requestfailed', req => {
    console.error(`REQUEST FAILED: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  await page.goto('/');
  console.log('✓ Página cargada');

  // Verificar que Supabase CDN cargó
  const supabaseLoaded = await page.evaluate(() => typeof window.supabase !== 'undefined');
  console.log('Supabase CDN cargado:', supabaseLoaded);

  // Verificar CONFIG
  const config = await page.evaluate(() => ({
    url: window.CONFIG?.SUPABASE_URL,
    hasKey: !!window.CONFIG?.SUPABASE_ANON_KEY,
  }));
  console.log('CONFIG:', JSON.stringify(config));

  // Verificar sbClient
  const sbClientOk = await page.evaluate(() => typeof window.sbClient !== 'undefined');
  console.log('sbClient definido:', sbClientOk);

  // Intentar login
  await page.fill('#password-input', 'halo-dm');
  await page.click('button.btn-login');

  // Esperar 5 segundos y ver qué pasa
  await page.waitForTimeout(5000);

  // Verificar estado
  const state = await page.evaluate(() => ({
    appVisible: document.getElementById('app')?.classList.contains('visible'),
    loginScreen: document.getElementById('login-screen')?.style.display,
    loginError: document.getElementById('login-error')?.textContent,
    sessionRole: sessionStorage.getItem('role'),
    sessionLoggedIn: sessionStorage.getItem('loggedIn'),
    gridNotasHTML: (document.getElementById('grid-notas')?.innerHTML || '').substring(0, 100),
  }));
  console.log('Estado tras login (5s):', JSON.stringify(state, null, 2));

  // Esperar más si el app no está visible
  if (!state.appVisible) {
    console.log('App no visible aún, esperando 15s más...');
    await page.waitForTimeout(15000);
    const state2 = await page.evaluate(() => ({
      appVisible: document.getElementById('app')?.classList.contains('visible'),
      loginError: document.getElementById('login-error')?.textContent,
      sessionRole: sessionStorage.getItem('role'),
    }));
    console.log('Estado tras 20s:', JSON.stringify(state2, null, 2));
  }

  console.log('\n--- LOGS DEL BROWSER ---');
  logs.forEach(l => console.log(l));
  console.log('\n--- ERRORES ---');
  errors.forEach(e => console.log(e));

  // No fallar el test, solo reportar
  expect(true).toBe(true);
});
