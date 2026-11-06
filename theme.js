(() => {
  const KEY = "playblox-theme";
  const darkLink = document.getElementById("playblox-dark-theme");
  const root = document.documentElement;

  function applyTheme(theme) {
    const isDark = theme === "dark";
    root.dataset.theme = isDark ? "dark" : "light";
    if (darkLink) darkLink.disabled = !isDark;
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(isDark));
      button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      button.innerHTML = isDark
        ? '<span aria-hidden="true">☀️</span><span>Light mode</span>'
        : '<span aria-hidden="true">🌙</span><span>Dark mode</span>';
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? "#080d20" : "#fff8e9";
  }

  let saved = "dark";
  try { saved = localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch (_) {}
  applyTheme(saved);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (_) {}
  });
})();