// Settings: the old announcement form is replaced by a link to the Announcements page,
// so notices are written, published and archived in one place.
(() => {
  const title = [...document.querySelectorAll("h2")].find(h => h.textContent.trim() === "Announcements");
  const card = title && title.closest(".pp-card");
  if (!card) return;
  card.innerHTML = `<div class="pp-card-head"><div><h2><i class="fa-solid fa-bullhorn" aria-hidden="true"></i> Announcements</h2>
      <p>Write, publish and archive notices. Members and trainers are alerted when you publish.</p></div></div>
    <a class="btn btn-primary" href="announcements.html"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> Open announcements</a>`;
})();
