(() => {
    const root = document.documentElement;
    try {
        if (localStorage.getItem('thm-theme') === 'dark') root.dataset.theme = 'dark';
    } catch {}
    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.querySelector('.theme-toggle');
        const themeColor = document.querySelector('meta[name="theme-color"]');
        function applyTheme() {
            const dark = root.dataset.theme === 'dark';
            toggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
            themeColor.content = dark ? '#0d0b0c' : '#f3efe8';
        }
        toggle.addEventListener('click', () => {
            root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem('thm-theme', root.dataset.theme); } catch {}
            applyTheme();
        });
        applyTheme();

        const menu = document.querySelector('#nav-menu');
        const burger = document.querySelector('.nav-burger');
        function showMenu(open) {
            menu.classList.toggle('open', open);
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }
        burger.addEventListener('click', () => showMenu(burger.getAttribute('aria-expanded') === 'false'));
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !menu.classList.contains('open')) return;
            showMenu(false);
            burger.focus();
        });
    }, { once: true });
})();
