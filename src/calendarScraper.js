/**
 * Calendar Scraper Content Script
 * Runs only on calendar.php to extract event dates
 * Bypasses Cloudflare by running in browser context
 */

(function () {
    'use strict';

    // Only run on calendar page
    if (!window.location.pathname.includes('calendar.php')) {
        return;
    }

    console.log('📅 Calendar Scraper: Running on calendar.php');

    // Wait for page to fully load
    function scrapeCalendarEvents() {
        try {
            const events = {};
            const currentYear = new Date().getFullYear();

            // Look for event containers
            // Torn uses various selectors - we'll try multiple approaches
            const eventSelectors = [
                '.calendarEvents .event',
                '.calendar-wrap .event-item',
                '[class*="event"]',
                '.calendar-event',
                'div[class*="calendar"] div[class*="event"]'
            ];

            let eventElements = [];
            for (const selector of eventSelectors) {
                eventElements = document.querySelectorAll(selector);
                if (eventElements.length > 0) {
                    console.log(`📅 Found ${eventElements.length} events using selector: ${selector}`);
                    break;
                }
            }

            if (eventElements.length === 0) {
                console.warn('⚠️ No event elements found with standard selectors, trying full scan...');
                // Fallback: scan all divs for event-like patterns
                const allDivs = document.querySelectorAll('div');
                eventElements = Array.from(allDivs).filter(div => {
                    const text = div.textContent || '';
                    // Look for divs containing month names and numbers
                    return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i.test(text);
                });
                console.log(`📅 Fallback scan found ${eventElements.length} potential events`);
            }

            eventElements.forEach((eventEl, index) => {
                console.log("========================================");
                console.log(`EVENT ${index}`);
                console.log("========================================");
                console.log("OUTER HTML:");
                console.log(eventEl.outerHTML);
                console.log("TEXT CONTENT:");
                console.log(eventEl.textContent);
                console.log("INNER HTML:");
                console.log(eventEl.innerHTML);
            });

            if (Object.keys(events).length > 0) {
                // Send to extension storage
                chrome.storage.local.set({
                    'event_calendar_overrides': events,
                    'calendar_last_scraped_year': currentYear
                }, () => {
                    console.log(`✅ Calendar scraped successfully! Saved ${Object.keys(events).length} events`);
                    console.log('📅 Event overrides:', events);
                });
            } else {
                console.warn('⚠️ No events were scraped from calendar page');
            }

        } catch (error) {
            console.error('❌ Calendar scraping failed:', error);
        }
    }

    // Run scraper after a delay to ensure DOM is ready
    setTimeout(scrapeCalendarEvents, 1000);

})();
