(() => {
  const form = document.getElementById("mainForm");
  if (!form) return;
  const status = document.getElementById("setup-status");
  const buttons = Array.from(form.querySelectorAll('button[type="submit"]'));
  let submitting = false;
  let selectedInstall;

  document.querySelectorAll("[data-password-target]").forEach((button) => {
    const input = document.getElementById(button.dataset.passwordTarget);
    if (!input) return;
    button.hidden = false;
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
      button.textContent = show ? button.dataset.hide : button.dataset.show;
    });
  });

  form.addEventListener("submit", (event) => {
    if (submitting) {
      event.preventDefault();
      return;
    }
    submitting = true;
    // Disabled submit buttons are omitted from form data; retain the chosen destination.
    selectedInstall = document.createElement("input");
    selectedInstall.type = "hidden";
    selectedInstall.name = "install";
    selectedInstall.value = event.submitter?.value || "desktop";
    form.appendChild(selectedInstall);
    form.setAttribute("aria-busy", "true");
    buttons.forEach((button) => {
      button.disabled = true;
    });
    status.textContent = form.dataset.checking;
  });

  window.addEventListener("pageshow", () => {
    submitting = false;
    selectedInstall?.remove();
    selectedInstall = undefined;
    form.removeAttribute("aria-busy");
    buttons.forEach((button) => {
      button.disabled = false;
    });
    status.textContent = "";
  });

  document.getElementById("setup-error")?.focus();
})();
