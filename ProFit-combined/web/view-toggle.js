/* Turns the Table / Cards pair into one button that switches to the other view. */
(() => {
  const group = document.querySelector(".pp-view-toggle");
  if (!group) return;
  const btns = [...group.querySelectorAll("[data-view-mode]")];
  const one = document.createElement("button");
  one.type = "button"; one.className = "pp-view-one"; group.appendChild(one);
  const current = () => (btns.find(b => b.classList.contains("active") || b.getAttribute("aria-pressed") === "true") || btns[0]).dataset.viewMode;
  const paint = () => {
    const next = current() === "table" ? "cards" : "table";
    one.innerHTML = next === "cards" ? '<i class="fa-solid fa-table-cells-large" aria-hidden="true"></i><span>Cards</span>' : '<i class="fa-solid fa-table-list" aria-hidden="true"></i><span>Table</span>';
    one.title = one.ariaLabel = "Switch to " + next + " view";
  };
  one.addEventListener("click", () => { btns.find(b => b.dataset.viewMode !== current())?.click(); setTimeout(paint, 0); });
  new MutationObserver(paint).observe(group, { subtree: true, attributes: true, attributeFilter: ["class", "aria-pressed"] });
  paint();
})();
