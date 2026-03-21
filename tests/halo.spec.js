// @ts-check
const { test, expect } = require('@playwright/test');

// ── HELPERS ────────────────────────────────────────────────────────────

async function login(page, password) {
  await page.goto('/');
  await page.waitForSelector('#login-screen', { state: 'visible' });
  await page.fill('#password-input', password);
  await page.click('button.btn-login');
  // Esperar app visible
  await page.waitForSelector('#app.visible', { timeout: 20000 });
  // Esperar que renderAll() haya corrido: grid-notas tiene cualquier contenido (cards o empty state)
  await page.waitForFunction(
    () => (document.getElementById('grid-notas')?.innerHTML || '').length > 10,
    { timeout: 25000 }
  );
}

async function waitForGrid(page, gridId) {
  // Esperar que el grid tenga al menos un hijo (card o empty state)
  await page.waitForFunction(
    (id) => (document.getElementById(id)?.children.length ?? 0) > 0,
    gridId,
    { timeout: 20000 }
  );
}

// ── AUTH ───────────────────────────────────────────────────────────────

test.describe('Autenticación', () => {
  test('pantalla de login visible al entrar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#password-input')).toBeVisible();
  });

  test('contraseña incorrecta muestra error', async ({ page }) => {
    await page.goto('/');
    await page.fill('#password-input', 'clave-incorrecta');
    await page.click('button.btn-login');
    await expect(page.locator('#login-error')).toContainText('incorrecta');
  });

  test('login como DM (halo-dm)', async ({ page }) => {
    await login(page, 'halo-dm');
    await expect(page.locator('#app')).toHaveClass(/visible/);
    await expect(page.locator('#app')).toHaveClass(/is-dm/);
    await expect(page.locator('[data-tab="utilidades"]')).toBeVisible();
  });

  test('login como Player (halo-players)', async ({ page }) => {
    await login(page, 'halo-players');
    await expect(page.locator('#app')).toHaveClass(/visible/);
    await expect(page.locator('#app')).not.toHaveClass(/is-dm/);
  });

  test('logout vuelve al login', async ({ page }) => {
    await login(page, 'halo-dm');
    await page.click('button.btn-danger:has-text("Salir")');
    await expect(page.locator('#login-screen')).toBeVisible();
  });
});

// ── CARGA DE DATOS ─────────────────────────────────────────────────────

test.describe('Carga de datos desde Supabase', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
  });

  test('NPCs cargados (>0 tarjetas)', async ({ page }) => {
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    const count = await page.locator('#grid-npcs .card').count();
    expect(count).toBeGreaterThan(0);
    console.log(`  NPCs: ${count} tarjetas`);
  });

  test('Ciudades cargadas (>0 tarjetas)', async ({ page }) => {
    await page.click('[data-tab="ciudades"]');
    await waitForGrid(page, 'grid-ciudades');
    const count = await page.locator('#grid-ciudades .card').count();
    expect(count).toBeGreaterThan(0);
    console.log(`  Ciudades: ${count} tarjetas`);
  });

  test('Establecimientos cargados (>0 tarjetas)', async ({ page }) => {
    await page.click('[data-tab="establecimientos"]');
    await waitForGrid(page, 'grid-establecimientos');
    const count = await page.locator('#grid-establecimientos .card').count();
    expect(count).toBeGreaterThan(0);
    console.log(`  Establecimientos: ${count} tarjetas`);
  });

  test('Items cargados (>0 tarjetas)', async ({ page }) => {
    await page.click('[data-tab="items"]');
    await waitForGrid(page, 'grid-items');
    const count = await page.locator('#grid-items .card').count();
    expect(count).toBeGreaterThan(0);
    console.log(`  Items: ${count} tarjetas`);
  });

  test('Personajes cargados (>0 tarjetas)', async ({ page }) => {
    await page.click('[data-tab="personajes"]');
    await waitForGrid(page, 'grid-personajes');
    const count = await page.locator('#grid-personajes .card').count();
    expect(count).toBeGreaterThan(0);
    console.log(`  Personajes: ${count} tarjetas`);
  });

  test('Quests cargadas (>0 tarjetas)', async ({ page }) => {
    await page.click('[data-tab="quests"]');
    await waitForGrid(page, 'grid-quests');
    const count = await page.locator('#grid-quests .card').count();
    expect(count).toBeGreaterThan(0);
    console.log(`  Quests: ${count} tarjetas`);
  });

  test('Notas DM cargadas (solo DM)', async ({ page }) => {
    await waitForGrid(page, 'grid-notas');
    const count = await page.locator('#grid-notas .card').count();
    expect(count).toBeGreaterThan(0);
    console.log(`  Notas DM: ${count} tarjetas`);
  });
});

// ── VISIBILIDAD DM vs PLAYER ───────────────────────────────────────────

test.describe('Control de visibilidad (RLS)', () => {
  test('DM ve más NPCs que Player', async ({ page, browser }) => {
    await login(page, 'halo-dm');
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    const countDM = await page.locator('#grid-npcs .card').count();

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await login(page2, 'halo-players');
    await page2.click('[data-tab="npcs"]');
    await waitForGrid(page2, 'grid-npcs');
    const countPlayer = await page2.locator('#grid-npcs .card').count();
    await ctx2.close();

    console.log(`  NPCs DM: ${countDM}, NPCs Player: ${countPlayer}`);
    expect(countDM).toBeGreaterThanOrEqual(countPlayer);
  });

  test('Player no ve botones dm-only', async ({ page }) => {
    await login(page, 'halo-players');
    const anyVisible = await page.locator('.dm-only').evaluateAll(
      els => els.some(el => getComputedStyle(el).display !== 'none')
    );
    expect(anyVisible).toBe(false);
  });
});

// ── MODAL DE DETALLE ───────────────────────────────────────────────────

test.describe('Modal de detalle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
  });

  test('click en NPC abre modal con nombre', async ({ page }) => {
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    const firstCard = page.locator('#grid-npcs .card').first();
    await firstCard.click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    const modalTitle = await page.locator('#modal-title').textContent();
    expect(modalTitle?.trim().length).toBeGreaterThan(0);
    console.log(`  Detalle NPC: "${modalTitle?.trim()}"`);
  });

  test('modal se cierra con botón Cerrar', async ({ page }) => {
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    await page.locator('#grid-npcs .card').first().click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await page.click('#modal-footer button:has-text("Cerrar")');
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/open/);
  });

  test('modal se cierra al clickear el overlay', async ({ page }) => {
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    await page.locator('#grid-npcs .card').first().click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await page.mouse.click(10, 10);
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/open/);
  });

  test('nota DM muestra contenido (pre-migrado de Notion)', async ({ page }) => {
    await waitForGrid(page, 'grid-notas');
    // Click en la primera nota del grid
    await page.locator('#grid-notas .card').first().click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    const modalTitle = await page.locator('#modal-title').textContent();
    console.log(`  Nota abierta: "${modalTitle?.trim()}"`);
    // Verificar que el contenedor de contenido existe (si es notas_dm)
    const contentEl = page.locator('#session-prep-content');
    if (await contentEl.count() > 0) {
      const html = await contentEl.innerHTML();
      console.log(`  contenido_html: ${html.length} chars`);
      // Puede ser "<em>Sin contenido</em>" o HTML real
      expect(html.length).toBeGreaterThan(0);
    }
  });
});

// ── FORMULARIO DE EDICIÓN ──────────────────────────────────────────────

test.describe('Formulario de edición (DM)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
  });

  test('botón Editar abre formulario con campo nombre', async ({ page }) => {
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    await page.locator('#grid-npcs .card').first().click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await page.click('#modal-footer button:has-text("Editar")');
    await expect(page.locator('#field-nombre')).toBeVisible();
    await expect(page.locator('#modal-body')).not.toHaveClass(/is-detail/);
  });

  test('crear Ciudad de prueba y verificar que aparece en el grid', async ({ page }) => {
    await page.click('[data-tab="ciudades"]');
    await waitForGrid(page, 'grid-ciudades');
    const countAntes = await page.locator('#grid-ciudades .card').count();

    // Abrir form de nueva ciudad
    await page.click('[onclick="openModal(\'ciudades\', null)"]');
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await expect(page.locator('#field-nombre')).toBeVisible();

    const testName = `TEST_Ciudad_PW_${Date.now()}`;
    await page.fill('#field-nombre', testName);
    await page.click('#modal-footer button:has-text("Guardar")');

    // Esperar a que el spinner desaparezca
    await page.waitForSelector('#spinner', { state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // La ciudad de prueba debe aparecer
    const newCard = page.locator('#grid-ciudades .card').filter({ hasText: testName });
    await expect(newCard).toBeVisible({ timeout: 10000 });
    console.log(`  Ciudad creada: "${testName}" (había ${countAntes} ciudades)`);
  });
});

// ── MAPA ───────────────────────────────────────────────────────────────

test.describe('Mapa', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
  });

  test('mapa carga y muestra SVG', async ({ page }) => {
    await page.click('[data-tab="mapa"]');
    await page.waitForSelector('#map-viewport svg', { timeout: 20000 });
    await expect(page.locator('#map-viewport svg')).toBeVisible();
  });

  test('botones de zoom funcionan', async ({ page }) => {
    await page.click('[data-tab="mapa"]');
    await page.waitForSelector('#map-viewport svg', { timeout: 20000 });
    await expect(page.locator('.map-zoom-btn').first()).toBeVisible();
    // Click zoom in no debería romper nada
    await page.click('.map-zoom-btn:has-text("+")');
  });
});

// ── BÚSQUEDA ───────────────────────────────────────────────────────────

test.describe('Búsqueda', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
  });

  test('buscar NPC filtra resultados', async ({ page }) => {
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    const totalAntes = await page.locator('#grid-npcs .card').count();

    await page.fill('#search-npcs', 'xxxxxx_nada_que_coincida');
    await page.waitForTimeout(400);
    const totalDespues = await page.locator('#grid-npcs .card').count();

    console.log(`  NPCs antes: ${totalAntes}, después de buscar: ${totalDespues}`);
    expect(totalDespues).toBeLessThan(totalAntes);
  });

  test('limpiar búsqueda restaura todos los resultados', async ({ page }) => {
    await page.click('[data-tab="npcs"]');
    await waitForGrid(page, 'grid-npcs');
    const totalOriginal = await page.locator('#grid-npcs .card').count();

    await page.fill('#search-npcs', 'xxxxxx_nada');
    await page.waitForTimeout(400);
    await page.fill('#search-npcs', '');
    await page.waitForTimeout(400);
    const totalFinal = await page.locator('#grid-npcs .card').count();

    expect(totalFinal).toBe(totalOriginal);
  });
});

// ── NAVEGACIÓN DE TABS ─────────────────────────────────────────────────

test.describe('Navegación de tabs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
  });

  test('todos los tabs cambian la sección activa', async ({ page }) => {
    const tabs = ['npcs', 'establecimientos', 'ciudades', 'lugares', 'items', 'personajes', 'quests', 'mapa'];
    for (const tab of tabs) {
      await page.click(`[data-tab="${tab}"]`);
      await expect(page.locator(`#section-${tab}`)).toHaveClass(/active/);
    }
  });
});
