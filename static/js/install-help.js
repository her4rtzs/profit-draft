/* Swaps the install card between "installed" and "browser" text.
   No install button: phones offer Add to Home Screen / Install app themselves. */
(function () {
  var status = document.getElementById("installHelpStatus");
  if (!status) return;
  var steps = document.querySelectorAll("[data-install-steps]");
  var mq = window.matchMedia("(display-mode: standalone)");

  function isInstalled() {
    return mq.matches || window.navigator.standalone === true;
  }

  function render() {
    var installed = isInstalled();
    status.textContent = installed
      ? "You're using the installed app."
      : "You can add ProFit to your home screen:";
    steps.forEach(function (el) {
      el.hidden = installed;
    });
  }

  render();
  if (mq.addEventListener) mq.addEventListener("change", render);
  else if (mq.addListener) mq.addListener(render);
})();
