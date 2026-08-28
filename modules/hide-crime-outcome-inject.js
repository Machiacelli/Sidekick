(() => {
    'use strict';

    if (window.__skCrimeFetchHooked) return;
    window.__skCrimeFetchHooked = true;

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        return originalFetch.apply(this, args).then(response => {
            try {
                const url = new URL(
                    response.url.startsWith('http')
                        ? response.url
                        : `${window.location.origin}/${response.url}`
                );
                const isCrimeAttempt = (
                    (url.pathname === '/page.php' && url.searchParams.get('sid') === 'crimesData' && url.searchParams.get('step') === 'attempt') ||
                    (url.pathname === '/loader.php' && url.searchParams.get('sid') === 'crimes' && url.searchParams.get('step') === 'attempt') ||
                    (url.pathname.includes('/loader.php') && url.searchParams.get('sid') === 'crimes')
                );

                if (isCrimeAttempt) {
                    response.clone().json().then(data => {
                        const outcome = data && ((data.DB && data.DB.outcome) || data.outcome);
                        if (!outcome) return;

                        const result = outcome.result || '';
                        const reward = (outcome.rewards || []).map(entry => {
                            const type = (entry.type || '').toLowerCase();
                            if (type === 'money') {
                                return entry.value ? `$${Number(entry.value).toLocaleString()}` : 'Money';
                            }
                            if (type === 'items' && Array.isArray(entry.value)) {
                                return entry.value.map(item => `${item.amount || 1}x ${item.name || 'Item'}`).join(', ');
                            }
                            if (type === 'jail') return 'Jailed';
                            if (type === 'hospital') return 'Hospitalized';
                            return entry.type || '';
                        }).filter(Boolean).join(' · ');

                        document.dispatchEvent(new CustomEvent('sk-crime-outcome', {
                            detail: { result, reward }
                        }));
                    }).catch(() => {});
                }
            } catch (_) {
                // A non-standard response URL must never affect Torn's fetch.
            }
            return response;
        });
    };
})();
