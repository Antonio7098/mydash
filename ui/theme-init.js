(() => {
  const key = "mydash-theme";
  let saved = null;
  try {
    saved = window.localStorage.getItem(key);
  } catch {
    saved = null;
  }
  const theme =
    saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia?.(
            "(prefers-color-scheme: dark)",
          ).matches
        ? "dark"
        : "light";
  document.documentElement.dataset.theme =
    theme;
})();
