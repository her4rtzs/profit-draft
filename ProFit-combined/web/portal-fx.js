/* Motion removed: no top bar, scroll reveal or page fades (they caused flicker). */
(() => { const r = () => document.body.classList.add("pf-ready"); document.body ? r() : document.addEventListener("DOMContentLoaded", r); })();
