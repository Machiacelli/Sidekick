// Sidekick Loadout Switcher - passive page-response bridge
// Runs in Torn's MAIN world before page scripts. It observes the Items page's
// own getEquippedItems response so the isolated Sidekick module can reuse the
// loadout titles without issuing an additional Torn request.
(function () {
    'use strict';

    const TITLES_KEY = 'silmaril-loadout-switcher-titles';
    const RFCV_KEY = 'silmaril-loadout-switcher-rfcv';
    const EVENT_NAME = 'sidekick:loadout-data';
    const originalFetch = window.fetch;

    function requestUrl(input) {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.href;
        return input?.url || '';
    }

    function captureRfcv(url) {
        try {
            const parsed = new URL(url, window.location.origin);
            const rfcv = parsed.searchParams.get('rfcv');
            if (rfcv) localStorage.setItem(RFCV_KEY, rfcv);
            return rfcv;
        } catch {
            return null;
        }
    }

    function publish(data, url) {
        const currentLoadouts = data?.currentLoadouts;
        if (!currentLoadouts || typeof currentLoadouts !== 'object') return;

        const titles = {};
        for (const [id, loadout] of Object.entries(currentLoadouts)) {
            if (loadout?.title) titles[id] = String(loadout.title);
        }
        if (Object.keys(titles).length === 0) return;

        const rfcv = captureRfcv(url);
        localStorage.setItem(TITLES_KEY, JSON.stringify(titles));
        document.dispatchEvent(new CustomEvent(EVENT_NAME, {
            detail: JSON.stringify({ titles, rfcv })
        }));
    }

    window.fetch = async function (...args) {
        const url = requestUrl(args[0]);
        const response = await originalFetch.apply(this, args);

        if (url.includes('sid=itemsLoadouts') && url.includes('step=getEquippedItems')) {
            response.clone().json()
                .then(data => publish(data, url))
                .catch(() => { /* Torn owns this response; never alter it. */ });
        }

        return response;
    };
})();
