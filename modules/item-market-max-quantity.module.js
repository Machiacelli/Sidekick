/**
 * Sidekick Chrome Extension - Item Market Max Quantity Module
 * Calculates max affordable quantity from current cash on Item Market pages
 */

(function () {
    'use strict';

    console.log('🛒 Loading Item Market Max Quantity Module...');

    const ItemMarketMaxQuantityModule = {
        isInitialized: false,
        boundClickHandler: null,

        init() {
            if (this.isInitialized) {
                return;
            }

            // Only run on Item Market page.
            if (!window.location.href.includes('page.php?sid=ItemMarket')) {
                return;
            }

            this.boundClickHandler = this.handleMaxQuantityClick.bind(this);
            document.addEventListener('click', this.boundClickHandler);
            this.isInitialized = true;

            console.log('✅ Item Market Max Quantity Module initialized');
        },

        getElementValue(element, regex) {
            if (!element) return null;
            const match = (element.textContent || '').match(regex);
            if (!match) return null;
            return parseInt(match[1].replace(/,/g, ''), 10);
        },

        getUserMoney() {
            const userMoneyElement = document.querySelector('#user-money');
            if (!userMoneyElement) return null;
            const money = parseInt(userMoneyElement.dataset.money || '0', 10);
            return Number.isFinite(money) ? money : null;
        },

        handleMaxQuantityClick(event) {
            const maxButton = event.target.closest('.input-money-symbol, [class*="input-money-symbol"]');
            if (!maxButton) return;

            const moneyGroup = maxButton.closest('.input-money-group, [class*="input-money-group"]');
            const sellerRow = moneyGroup?.closest('.sellerRow___AI0m6, [class*="sellerRow"]');
            const quantityInput = moneyGroup?.querySelector('input.input-money:not([type="hidden"]), input[class*="input-money"]:not([type="hidden"])');

            if (!moneyGroup || !sellerRow || !quantityInput) return;

            const userMoney = this.getUserMoney();
            if (!userMoney || userMoney <= 0) return;

            const priceElement = sellerRow.querySelector('.price___Uwiv2, [class*="price"]');
            if (!priceElement) return;

            const price = this.getElementValue(priceElement, /\$([0-9,]+)/);
            if (!price || price <= 0) return;

            const affordableQuantity = Math.floor(userMoney / price);
            quantityInput.value = affordableQuantity;
            quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    window.SidekickModules.ItemMarketMaxQuantity = ItemMarketMaxQuantityModule;
    console.log('✅ Item Market Max Quantity Module loaded and ready');
})();
