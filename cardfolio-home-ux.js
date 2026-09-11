/* Cardfolio home UX + perceived-performance layer.
   Keeps category exploration on Home, expires Recently added after 72h,
   and signs private card images off the critical render path. */
(() => {
  'use strict';

  const RECENT_WINDOW_MS = 72 * 60 * 60 * 1000;
  const DRAWER_ID = 'homeCategoryDrawer';
  let hydrationRun = null;

  const esc = (value = '') => (typeof escapeHtml === 'function'
    ? escapeHtml(String(value))
    : String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  const categoryName = (holding) => {
    const raw = String(holding?.category || 'Other').trim();
    const league = String(holding?.league || '').trim().toUpperCase();
    if (raw === 'Basketball') return league === 'WNBA' ? 'WNBA' : 'NBA';
    if (raw === 'WNBA') return 'WNBA';
    if (/pok[eé]mon/i.test(raw)) return 'Pokémon';
    return raw || 'Other';
  };

  const categoryIcon = (name) => ({
    NBA:'◉', WNBA:'◉', Soccer:'⬡', 'Pokémon':'✦', Baseball:'◆', Football:'⬢',
    Hockey:'◇', 'UFC / MMA':'✹', Wrestling:'✦', 'Formula 1':'▱', NASCAR:'▰', College:'⌂', Other:'◇'
  })[name] || '◇';

  const canonicalForHolding = (holding) => {
    if (holding?._canonical) return holding._canonical;
    if (state?.canonicalIndex?.get && holding?.canonical_card_id) return state.canonicalIndex.get(holding.canonical_card_id) || null;
    if (state?.canonicalCards && holding?.canonical_card_id) return state.canonicalCards[holding.canonical_card_id] || null;
    return null;
  };

  const unitPrice = (holding) => {
    const canonical = canonicalForHolding(holding);
    const values = [canonical?.current_price, holding?.market_value, holding?.manual_value];
    for (const value of values) {
      if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) return Number(value);
    }
    return null;
  };

  const cardName = (holding) => String(holding?.display_name || holding?.subject || 'Untitled card').trim();
  const moneyText = (value) => typeof money === 'function' ? money(value) : `$${Number(value || 0).toFixed(2)}`;

  const recentHoldingIds = () => {
    const cutoff = Date.now() - RECENT_WINDOW_MS;
    return new Set((state?.holdings || []).filter((holding) => {
      const created = Date.parse(holding?.created_at || '');
      return Number.isFinite(created) && created >= cutoff;
    }).slice(0, 8).map((holding) => String(holding.id)));
  };

  function enhanceHomeMarkup(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    const categoryStrip = template.content.querySelector('.category-strip');
    if (categoryStrip) {
      categoryStrip.querySelectorAll('.category-bubble[data-open-category]').forEach((button) => {
        button.removeAttribute('data-view');
        button.type = 'button';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', DRAWER_ID);
      });
      const drawer = document.createElement('section');
      drawer.id = DRAWER_ID;
      drawer.className = 'home-category-drawer';
      drawer.hidden = true;
      drawer.setAttribute('aria-live', 'polite');
      categoryStrip.insertAdjacentElement('afterend', drawer);
    }

    const recentSection = [...template.content.querySelectorAll('.home-section')]
      .find((section) => section.querySelector('h2')?.textContent?.trim() === 'Recently added');
    if (recentSection) {
      const allowed = recentHoldingIds();
      const grid = recentSection.querySelector('.home-album');
      if (grid) {
        grid.querySelectorAll('[data-detail-card]').forEach((card) => {
          if (!allowed.has(String(card.getAttribute('data-detail-card') || ''))) card.remove();
        });
        if (!grid.querySelector('[data-detail-card]')) {
          const empty = document.createElement('div');
          empty.className = 'glass-empty recent-empty';
          empty.innerHTML = '<strong>No recent cards.</strong><p>Cards leave Recently added after 3 days, but stay in Portfolio and their category.</p>';
          grid.replaceWith(empty);
        }
      }
    }

    return template.innerHTML;
  }

  function drawerCard(holding) {
    const price = unitPrice(holding);
    const meta = [holding?.team, holding?.parallel, holding?.card_number ? `#${holding.card_number}` : '']
      .filter(Boolean).join(' · ') || categoryName(holding);
    const image = holding?.image_url
      ? `<img src="${esc(holding.image_url)}" alt="${esc(cardName(holding))}" loading="lazy" decoding="async">`
      : `<div class="home-drawer-placeholder">${categoryIcon(categoryName(holding))}</div>`;
    return `<button type="button" class="home-drawer-card" data-home-drawer-card="${esc(holding.id)}">
      <span class="home-drawer-image">${image}</span>
      <span class="home-drawer-copy"><strong>${esc(cardName(holding))}</strong><small>${esc(meta)}</small><b>${price === null ? 'Pending Price' : moneyText(price)}</b></span>
    </button>`;
  }

  function openCategoryDrawer(name, sourceButton) {
    const drawer = document.getElementById(DRAWER_ID);
    if (!drawer) return;
    const cards = (state?.holdings || []).filter((holding) => categoryName(holding) === name);
    drawer.innerHTML = `<div class="home-category-drawer-head">
      <div><span>${categoryIcon(name)}</span><div><small>Category</small><strong>${esc(name)}</strong></div></div>
      <button type="button" class="home-category-close" aria-label="Close ${esc(name)} category">×</button>
    </div>
    <div class="home-category-drawer-grid">${cards.map(drawerCard).join('')}</div>`;
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    document.querySelectorAll('.category-bubble[data-open-category]').forEach((button) => {
      button.setAttribute('aria-expanded', String(button === sourceButton));
      button.classList.toggle('selected', button === sourceButton);
    });
    drawer.querySelector('.home-category-close')?.addEventListener('click', closeCategoryDrawer);
    drawer.querySelectorAll('[data-home-drawer-card]').forEach((button) => button.addEventListener('click', () => {
      const holding = (state?.holdings || []).find((item) => String(item.id) === String(button.dataset.homeDrawerCard));
      if (holding && typeof openCardDialog === 'function') openCardDialog(holding);
    }));
    drawer.scrollIntoView({behavior:'smooth', block:'nearest'});
  }

  function closeCategoryDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('open');
    document.querySelectorAll('.category-bubble[data-open-category]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
      button.classList.remove('selected');
    });
    window.setTimeout(() => { if (!drawer.classList.contains('open')) drawer.hidden = true; }, 180);
  }

  const baseHomeView = typeof homeView === 'function' ? homeView : null;
  if (baseHomeView) {
    homeView = function () {
      return enhanceHomeMarkup(baseHomeView());
    };
  }

  const baseBindViewEvents = typeof bindViewEvents === 'function' ? bindViewEvents : null;
  bindViewEvents = function () {
    baseBindViewEvents?.();
    if (state?.view !== 'home') return;
    document.querySelectorAll('.category-bubble[data-open-category]').forEach((button) => {
      button.removeAttribute('data-view');
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const name = button.dataset.openCategory;
        const drawer = document.getElementById(DRAWER_ID);
        if (drawer && !drawer.hidden && button.classList.contains('selected')) closeCategoryDrawer();
        else openCategoryDrawer(name, button);
      });
    });
  };

  function patchVisibleImages() {
    const cssEscape = window.CSS?.escape ? window.CSS.escape.bind(window.CSS) : (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    for (const holding of state?.holdings || []) {
      if (!holding?.image_url || !holding?.id) continue;
      const id = cssEscape(String(holding.id));
      document.querySelectorAll(`[data-detail-card="${id}"] .album-image-wrap`).forEach((wrap) => {
        let image = wrap.querySelector('img');
        if (!image) {
          image = document.createElement('img');
          image.loading = 'lazy';
          image.decoding = 'async';
          wrap.querySelector('.album-placeholder')?.replaceWith(image);
        }
        image.src = holding.image_url;
        image.alt = cardName(holding);
      });
      document.querySelectorAll(`.holding[data-card-id="${id}"]`).forEach((row) => {
        let image = row.querySelector('img.thumb');
        if (!image) {
          image = document.createElement('img');
          image.className = 'thumb';
          image.loading = 'lazy';
          image.decoding = 'async';
          row.querySelector('.thumb.placeholder')?.replaceWith(image);
        }
        image.src = holding.image_url;
        image.alt = cardName(holding);
      });
    }
  }

  // Signed image URLs are private and short-lived. Generate them in the background,
  // update in-memory state only, then patch visible images without blocking cloud sync.
  hydrateSignedImages = async function () {
    if (!state?.supabase || !state?.user) return;
    const paths = [...new Set((state.holdings || []).filter((holding) => holding.image_path).map((holding) => holding.image_path))];
    if (!paths.length || hydrationRun) return;

    const run = async () => {
      const bucket = state.supabase.storage.from('card-images');
      try {
        if (typeof bucket.createSignedUrls === 'function') {
          const {data, error} = await bucket.createSignedUrls(paths, 3600);
          if (!error && Array.isArray(data)) {
            data.forEach((row, index) => {
              const path = row?.path || paths[index];
              const holding = (state.holdings || []).find((item) => item.image_path === path);
              if (holding && row?.signedUrl) holding.image_url = row.signedUrl;
            });
            patchVisibleImages();
            return;
          }
        }
        await Promise.all(paths.map(async (path) => {
          const {data} = await bucket.createSignedUrl(path, 3600);
          const holding = (state.holdings || []).find((item) => item.image_path === path);
          if (holding && data?.signedUrl) holding.image_url = data.signedUrl;
        }));
        patchVisibleImages();
      } catch (error) {
        console.warn('Cardfolio image hydration deferred', error);
      }
    };

    const launch = () => {
      hydrationRun = run().finally(() => { hydrationRun = null; });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(launch, {timeout: 220});
    else setTimeout(launch, 0);
  };
})();
