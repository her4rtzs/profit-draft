// My profile: staff photo and details, kept in this browser and mirrored into
// the rail and header avatar the moment anything is saved.
(() => {
  const $ = id => document.getElementById(id);
  const notice = $("profileNotice");
  const flash = (msg, bad) => {
    if (!notice) return;
    notice.hidden = false;
    notice.textContent = msg;
    notice.classList.toggle("error", !!bad);
    if (!bad) notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const auth = window.ProFitAuth && window.ProFitAuth.user;
  let profile = window.ProFitProfile.get();
  if (!profile.name && (auth?.name || auth?.email)) {
    profile = { ...profile, name: auth.name || "", email: auth.email || "", role: auth.role === "MEMBER" ? "Gym member" : "Gym administrator" };
  }

  function paint() {
    $("identityName").textContent = profile.name || "Administrator";
    $("identityRole").textContent = profile.role || "Gym administrator";
    $("profileName").value = profile.name || "";
    $("profileRole").value = profile.role || "";
    $("profileEmail").value = profile.email || "";
    $("profilePhone").value = profile.phone || "";
    $("profileBio").value = profile.bio || "";

    const box = $("profilePhotoBox");
    if (!box) return;
    const img = box.querySelector("img");
    if (profile.photo) {
      if (!img) { const el = document.createElement("img"); el.alt = ""; box.prepend(el); }
      box.querySelector("img").src = profile.photo;
      box.classList.add("has-photo");
    } else {
      if (img) img.remove();
      box.classList.remove("has-photo");
    }
    const clear = $("profilePhotoClear");
    if (clear) clear.disabled = !profile.photo;
  }

  function commit(patch, message) {
    profile = { ...profile, ...patch };
    const saved = window.ProFitProfile.save(patch);
    if (!saved) return flash("Browser storage is full — try a smaller photo.", true);
    profile = saved;
    paint();
    // Repaints the rail avatar, the header avatar and the account menu name.
    window.dispatchEvent(new CustomEvent("profit-account-changed"));
    if (message) flash(message);
    return saved;
  }

  $("profilePhoto")?.addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) return flash("Choose an image file for your photo.", true);
    if (file.size > 900 * 1024) return flash("That photo is over 900 KB. Please pick a smaller one.", true);
    const reader = new FileReader();
    reader.onload = () => commit({ photo: String(reader.result) }, "Photo updated.");
    reader.onerror = () => flash("That photo could not be read. Try another one.", true);
    reader.readAsDataURL(file);
  });

  $("profilePhotoClear")?.addEventListener("click", () => commit({ photo: "" }, "Photo removed."));

  $("profileForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const name = $("profileName").value.trim();
    if (!name) return flash("Your name cannot be empty.", true);
    commit({
      name,
      role: $("profileRole").value.trim() || "Gym administrator",
      email: $("profileEmail").value.trim(),
      phone: $("profilePhone").value.trim(),
      bio: $("profileBio").value.trim()
    }, "Profile saved.");
  });

  $("passwordForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const current = $("pwCurrent").value, next = $("pwNext").value;
    if (!current || !next) return flash("Fill in both password fields.", true);
    if (next.length < 8) return flash("Use at least 8 characters for the new password.", true);
    e.target.reset();
    flash("Password updated for this demo account.");
  });

  paint();
})();
