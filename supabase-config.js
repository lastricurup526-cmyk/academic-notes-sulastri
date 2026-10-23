
/* =====================================
   KONFIGURASI SUPABASE
   ===================================== */

(() => {
  "use strict";

  window.SUPABASE_URL =
    "https://yyusqibbxqusbimvmlar.supabase.co";

  window.SUPABASE_ANON_KEY =
    "sb_publishable_dI9sWdqoEBRL5RPm7bY8Tw_gTcNVxVF";

  if (!window.supabase) {
    console.error(
      "Supabase belum dimuat. Periksa script CDN di index.html."
    );
    return;
  }

  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY
    );
  }

  console.log("Konfigurasi Supabase berhasil dimuat.");
})();
