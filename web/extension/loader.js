// FreeJam content-script loader.
//
// Pulls the latest web bundle from the FreeJam server and evals it in the
// page's main world. Using a remote fetch (instead of bundling the script
// into the extension) keeps the extension small and lets the server iterate
// without users having to update their installed extension.

(() => {
  const SERVER = "https://167-234-216-26.nip.io/web.js";
  if (window.__freejam_loader_ran) return;
  window.__freejam_loader_ran = true;
  fetch(SERVER + "?v=" + Date.now(), { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then((src) => {
      // eslint-disable-next-line no-new-func
      new Function(src)();
    })
    .catch((e) => {
      console.error("[FreeJam] failed to load bundle:", e);
    });
})();
