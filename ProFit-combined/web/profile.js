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

  // Two steps: verify the current password on the server, then set a new one.
  let pwVerified = false;
  const pwReset = () => { pwVerified = false; $("pwStep2").hidden = true; $("pwCurrent").readOnly = false; $("pwBtn").innerHTML = '<i class="fa-solid fa-shield-halved"></i> Verify password'; $("pwState").textContent = "Step 1: confirm it is really you."; };
  $("passwordForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("pwBtn"), current = $("pwCurrent").value;
    btn.disabled = true;
    try {
      if (!pwVerified) {
        if (!current) return flash("Enter your current password.", true);
        await window.ProFitAPI.post("/auth/verify-password", { current_password: current });
        pwVerified = true; $("pwCurrent").readOnly = true; $("pwStep2").hidden = false;
        btn.innerHTML = '<i class="fa-solid fa-key"></i> Update password'; $("pwState").textContent = "Verified. Now choose a new password.";
        $("pwNext").focus();
      } else {
        const next = $("pwNext").value;
        if (next.length < 8) return flash("Use at least 8 characters for the new password.", true);
        if (next !== $("pwConfirm").value) return flash("The new passwords do not match.", true);
        await window.ProFitAPI.post("/auth/change-password", { current_password: current, new_password: next });
        e.target.reset(); pwReset(); flash("Password updated.");
      }
    } catch (err) { flash(err.message || "Could not update the password.", true); }
    finally { btn.disabled = false; }
  });

  paint();
})();
