(() => {
  const button = document.getElementById("copy-installation-link");
  const link = document.getElementById("installation-link");
  const status = document.getElementById("copy-status");
  if (!button || !link || !status) return;
  button.hidden = false;
  let copying = false;

  button.addEventListener("click", async () => {
    if (copying) return;
    copying = true;
    button.disabled = true;
    status.textContent = button.dataset.copying;
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(link.value);
      status.textContent = button.dataset.copied;
    } catch {
      link.focus();
      link.select();
      status.textContent = button.dataset.manual;
    } finally {
      copying = false;
      button.disabled = false;
    }
  });
})();
