
(() => {
  "use strict";

  const db = window.supabaseClient;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    session: null,
    isOwner: false,
    notes: [],
    filter: "all",
    profile: null,
    references: []
  };

  let toastTimer;
  let selectedProfilePhoto = null;
  let profilePhotoPreviewUrl = null;

  function toast(message) {
    const node = $("#toast");

    if (node) {
      node.textContent = message;
      node.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(
        () => node.classList.remove("show"),
        4000
      );
    } else {
      alert(message);
    }
  }

  function esc(value = "") {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  function owner() {
    return Boolean(state.session?.user && state.isOwner);
  }

  function requireOwner() {
    if (owner()) return true;
    toast("Login sebagai pemilik terlebih dahulu.");
    return false;
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 150) || `catatan-${Date.now()}`;
  }

  function noteType(note) {
    const value = String(
      note?.content_type || note?.category_type || "materi"
    ).toLowerCase();

    if (value.includes("jurnal") || value.includes("journal_summary")) {
      return "jurnal";
    }

    if (value.includes("artikel") || value === "article") {
      return "artikel";
    }

    if (
      value.includes("materi") ||
      value.includes("kuliah") ||
      value === "note"
    ) {
      return "materi";
    }

    return "lainnya";
  }

  function typeLabel(type) {
    return ({
      materi: "Catatan kuliah",
      artikel: "Artikel",
      jurnal: "Ringkasan jurnal",
      lainnya: "Lainnya"
    })[type] || type;
  }

  function dbContentType(type) {
    return ({
      materi: "note",
      artikel: "article",
      jurnal: "journal_summary",
      lainnya: "other"
    })[type] || "note";
  }

  function favorites() {
    try {
      return JSON.parse(
        localStorage.getItem("academicNotesFavorites") || "[]"
      );
    } catch {
      return [];
    }
  }

  function findKey(row, candidates) {
    return candidates.find(
      (key) => row &&
        Object.prototype.hasOwnProperty.call(row, key)
    );
  }

  function readValue(row, candidates, fallback = "") {
    const key = findKey(row, candidates);

    return key && row[key] != null
      ? row[key]
      : fallback;
  }

  function storagePublicUrl(path) {
    if (!path) return "";

    const value = String(path).trim();

    if (/^(https?:|data:|blob:)/i.test(value) || value.startsWith("/")) {
      return value;
    }

    if (value.startsWith("assets/")) return value;

    if (!db?.storage) return value;

    const { data } = db.storage
      .from("profile-assets")
      .getPublicUrl(value);

    return data?.publicUrl || value;
  }

  function setProfileImage(selector, path) {
    const img = $(selector);
    if (!img) return;

    const initial = selector === "#profileImage"
      ? $("#profileInitial")
      : $("#dialogProfileInitial");

    const url = storagePublicUrl(path);

    img.onerror = () => {
      img.classList.add("hidden");
      initial?.classList.remove("hidden");
    };

    img.onload = () => {
      img.classList.remove("hidden");
      initial?.classList.add("hidden");
    };

    if (!url) {
      img.removeAttribute("src");
      img.classList.add("hidden");
      initial?.classList.remove("hidden");
      return;
    }

    img.classList.remove("hidden");
    img.src = url;
  }

  function safeNoteHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");

    template.content
      .querySelectorAll(
        "script,style,iframe,object,embed,form,svg,math"
      )
      .forEach((el) => el.remove());

    template.content.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();

        if (
          name.startsWith("on") ||
          name === "srcdoc" ||
          (
            (name === "href" || name === "src") &&
            /^\s*javascript:/i.test(value)
          )
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return template.content;
  }

  async function setOwnerUI(session, showMessage = false) {
    state.session = session || null;
    state.isOwner = false;

    if (state.session?.user && db) {
      const { data, error } = await db
        .from("editor_access")
        .select("user_id")
        .eq("user_id", state.session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Pemeriksaan editor_access gagal:", error);

        if (showMessage) {
          const message = $("#ownerLoginMessage");

          if (message) {
            message.textContent =
              "Login berhasil, tetapi akses pemilik gagal diperiksa: " +
              error.message;
          }
        }
      } else {
        state.isOwner = Boolean(
          data && data.user_id === state.session.user.id
        );
      }

      if (showMessage && !state.isOwner && !error) {
        const message = $("#ownerLoginMessage");

        if (message) {
          message.textContent =
            "Akun belum terdaftar di editor_access.";
        }
      }
    }

    const loggedIn = owner();

    $("#ownerLoginButton")?.classList.toggle("hidden", loggedIn);
    $("#ownerLogoutButton")?.classList.toggle(
      "hidden",
      !state.session
    );
    $("#editProfile")?.classList.toggle("hidden", !loggedIn);
    $("#newNote")?.classList.toggle("hidden", !loggedIn);
    $("#addReference")?.classList.toggle("hidden", !loggedIn);

    const status = $("#ownerStatus");

    if (status) {
      status.textContent = loggedIn
        ? "Mode pemilik"
        : state.session
          ? "Login: akses pemilik belum aktif"
          : "Mode pengunjung";

      status.classList.remove("hidden");
    }

    renderNotes();
  }

  function showLibrary() {
    $("#homeView")?.classList.add("hidden");
    $("#libraryView")?.classList.remove("hidden");

    loadNotes();

    $("#libraryView")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function showHome() {
    $("#libraryView")?.classList.add("hidden");
    $("#homeView")?.classList.remove("hidden");

    $("#homeView")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function filteredNotes() {
    const query = ($("#searchInput")?.value || "")
      .trim()
      .toLowerCase();

    return state.notes.filter((note) => {
      const type = noteType(note);
      const isFavorite = favorites().includes(String(note.id));

      const matchesFilter =
        state.filter === "all" ||
        (state.filter === "favorite" && isFavorite) ||
        (state.filter !== "favorite" && type === state.filter);

      const searchable = [
        note.title,
        note.excerpt,
        note.body_markdown,
        note.topic,
        note.course_name
      ].join(" ").toLowerCase();

      return matchesFilter &&
        (!query || searchable.includes(query));
    });
  }

  async function loadNotes() {
    if (!db) return;

    const { data, error } = await db
      .from("content_items")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Supabase load content_items:", error);
      toast("Catatan gagal dimuat: " + error.message);
      return;
    }

    state.notes = (data || []).filter(
      (note) => owner() || note.status === "published"
    );

    renderNotes();
  }

  function renderNotes() {
    const grid = $("#notesGrid");
    if (!grid) return;

    const notes = filteredNotes();

    if ($("#noteCount")) {
      $("#noteCount").textContent = `${notes.length} catatan`;
    }

    if (!notes.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>Belum ada catatan yang ditampilkan.</h3>
          <p>${
            owner()
              ? "Klik “Catatan baru” untuk menambahkan materi."
              : "Catatan yang dipublikasikan akan muncul di sini."
          }</p>
        </div>`;
      return;
    }

    grid.innerHTML = notes.map((note) => {
      const type = noteType(note);
      const isFavorite = favorites().includes(String(note.id));

      const preview = String(
        note.excerpt || note.body_markdown || ""
      )
        .replace(/<[^>]*>/g, " ")
        .replace(/[#*_>`~-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const date = note.updated_at
        ? new Date(note.updated_at).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric"
          })
        : "";

      return `
        <article class="note-card">
          <div class="note-card-top">
            <span class="note-type">${esc(typeLabel(type))}</span>
            <button
              type="button"
              class="favorite-button"
              data-action="favorite"
              data-id="${esc(note.id)}"
              aria-label="Favorit"
            >${isFavorite ? "★" : "☆"}</button>
          </div>

          <button
            type="button"
            class="note-card-open"
            data-action="open"
            data-id="${esc(note.id)}"
          >
            <h3>${esc(note.title || "Tanpa judul")}</h3>
            ${
              note.topic
                ? `<p class="note-topic">${esc(note.topic)}</p>`
                : ""
            }
            <p>${esc(
              preview.slice(0, 180) ||
              "Buka untuk membaca catatan ini."
            )}</p>
          </button>

          <div class="note-card-footer">
            <span>${esc(date)}</span>
            <span>${esc(note.status || "")}</span>
          </div>

          ${
            owner()
              ? `
                <div class="note-card-actions">
                  <button
                    type="button"
                    data-action="edit"
                    data-id="${esc(note.id)}"
                  >Edit</button>
                  <button
                    type="button"
                    data-action="delete"
                    data-id="${esc(note.id)}"
                  >Hapus</button>
                </div>`
              : ""
          }
        </article>`;
    }).join("");
  }

  function openEditor(note = null) {
    if (!requireOwner()) return;

    $("#editorPanel")?.classList.remove("hidden");
    $("#notesGrid")?.classList.add("hidden");
    $("#filterTabs")?.classList.add("hidden");
    $(".library-toolbar")?.classList.add("hidden");
    $(".library-summary")?.classList.add("hidden");

    $("#noteForm")?.reset();

    if ($("#noteId")) $("#noteId").value = note?.id || "";
    if ($("#noteTitle")) $("#noteTitle").value = note?.title || "";
    if ($("#noteType")) $("#noteType").value = note ? noteType(note) : "materi";
    if ($("#noteTopic")) $("#noteTopic").value = note?.topic || "";
    if ($("#noteBody")) $("#noteBody").innerHTML = note?.body_markdown || "";

    if ($("#editorState")) {
      $("#editorState").textContent = note
        ? "Edit catatan"
        : "Catatan baru";
    }

    state.references = [];
    renderReferences();

    $("#editorPanel")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function closeEditor() {
    $("#editorPanel")?.classList.add("hidden");
    $("#notesGrid")?.classList.remove("hidden");
    $("#filterTabs")?.classList.remove("hidden");
    $(".library-toolbar")?.classList.remove("hidden");
    $(".library-summary")?.classList.remove("hidden");
  }

  async function saveNote(event) {
    event.preventDefault();

    if (!db || !requireOwner()) return;

    const title = $("#noteTitle")?.value.trim();

    if (!title) {
      toast("Judul catatan wajib diisi.");
      $("#noteTitle")?.focus();
      return;
    }

    const bodyElement = $("#noteBody");
    const bodyHtml = bodyElement?.innerHTML.trim() || "";
    const bodyText = bodyElement?.innerText.trim() || "";

    if (!bodyText) {
      toast("Isi catatan masih kosong.");
      bodyElement?.focus();
      return;
    }

    const type = $("#noteType")?.value || "materi";
    const existingId = $("#noteId")?.value || "";

    const payload = {
      title,
      slug: slugify(title),
      excerpt: bodyText.slice(0, 240),
      body_markdown: bodyHtml,
      content_type: dbContentType(type),
      course_name: readValue(
        state.profile,
        ["course_name", "course_title", "mata_kuliah", "course"],
        ""
      ),
      topic: $("#noteTopic")?.value.trim() || "",
      status: "published",
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const submit = $('#noteForm button[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      const result = existingId
        ? await db.from("content_items")
            .update(payload)
            .eq("id", existingId)
            .select()
            .single()
        : await db.from("content_items")
            .insert(payload)
            .select()
            .single();

      if (result.error) throw result.error;

      toast("Catatan berhasil disimpan.");
      closeEditor();
      await loadNotes();
    } catch (error) {
      console.error("Gagal menyimpan catatan:", error);
      toast("Catatan gagal disimpan: " + error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function deleteNote(id) {
    if (!db || !requireOwner()) return;
    if (!confirm("Hapus catatan ini secara permanen?")) return;

    const { error } = await db
      .from("content_items")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase delete content_items:", error);
      toast("Catatan gagal dihapus: " + error.message);
      return;
    }

    toast("Catatan berhasil dihapus.");
    await loadNotes();
  }

  function openNote(note) {
    if (!note) return;

    const dialog = document.createElement("dialog");
    dialog.className = "modal note-reading-modal";

    const heading = document.createElement("div");
    heading.className = "modal-heading";

    const titleArea = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = typeLabel(noteType(note));

    const title = document.createElement("h2");
    title.textContent = note.title || "";

    titleArea.append(eyebrow, title);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "close-modal";
    close.textContent = "×";
    close.setAttribute("aria-label", "Tutup");

    heading.append(titleArea, close);
    dialog.appendChild(heading);

    if (note.topic) {
      const topic = document.createElement("p");
      topic.className = "note-topic";
      topic.textContent = note.topic;
      dialog.appendChild(topic);
    }

    const body = document.createElement("div");
    body.className = "note-reading-body";

    const savedBody = String(note.body_markdown || "");

    if (/<(p|br|strong|b|em|i|u|h[1-6]|ul|ol|li|blockquote|a)\b/i.test(savedBody)) {
      body.appendChild(safeNoteHtml(savedBody));
    } else {
      body.textContent = savedBody;
    }

    dialog.appendChild(body);

    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());

    document.body.appendChild(dialog);
    dialog.showModal();
  }

  function renderProfile(row) {
    state.profile = row || null;

    const name = readValue(
      row,
      ["full_name", "name", "student_name", "nama"],
      "Nama Mahasiswa"
    );

    const npm = readValue(
      row,
      ["npm", "student_id", "student_number"],
      "NPM belum diisi"
    );

    const prodi = readValue(
      row,
      ["study_program", "program_study", "prodi", "program_studi"],
      "Belum diisi"
    );

    const faculty = readValue(row, ["faculty", "fakultas"], "Belum diisi");
    const university = readValue(row, ["university", "universitas"], "Belum diisi");

    const course = readValue(
      row,
      ["course_name", "course_title", "mata_kuliah", "course"],
      "Nama Mata Kuliah"
    );

    const description = readValue(
      row,
      ["description", "course_description", "bio"],
      "Simpan artikel, catatan kuliah, dan referensi akademikmu."
    );

    const initial = String(name).trim()[0] || "M";

    const textMap = {
      "#profileName": name,
      "#profileNpm": npm,
      "#profileProdi": prodi,
      "#profileFakultas": faculty,
      "#profileUniversitas": university,
      "#courseTitle": course,
      "#courseTitleSmall": String(course || "Nama Mata Kuliah").toUpperCase(),
      "#courseDescription": description,
      "#profileInitial": initial.toUpperCase(),
      "#dialogProfileInitial": initial.toUpperCase()
    };

    Object.entries(textMap).forEach(([selector, value]) => {
      const element = $(selector);
      if (element) element.textContent = value;
    });

    const photoPath = "assets/profil.jpeg";

setProfileImage("#profileImage", photoPath);
setProfileImage("#dialogProfileImage", photoPath);

    const backgroundPath = readValue(
      row,
      ["background_image_path", "background_url", "hero_background_url"],
      ""
    );

    const hero = $("#heroVisual");

    if (hero) {
      const backgroundUrl = storagePublicUrl(backgroundPath);

      hero.style.backgroundImage = backgroundUrl
        ? `linear-gradient(rgba(25,30,24,.12), rgba(25,30,24,.12)), url("${backgroundUrl.replace(/["\\]/g, "")}")`
        : "";

      hero.style.backgroundSize = "cover";
      hero.style.backgroundPosition = "center";
    }

    const inputs = {
      "#inputName": name,
      "#inputNpm": npm,
      "#inputProdi": prodi,
      "#inputFakultas": faculty,
      "#inputUniversitas": university,
      "#inputCourse": course,
      "#inputDescription": description
    };

    Object.entries(inputs).forEach(([selector, value]) => {
      const element = $(selector);
      if (element) element.value = value || "";
    });
  }

  async function loadProfile() {
    if (!db) return;

    const { data, error } = await db
      .from("site_profile")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("Supabase load site_profile:", error);
      toast("Profil gagal dimuat: " + error.message);
      return;
    }

    if (data) {
      renderProfile(data);
    } else {
      renderProfile({ id: 1 });
      console.warn("Belum ada row id=1 pada site_profile.");
    }
  }

  
function setupProfilePhotoPicker() {
  const input = $("#profilePhotoFile");
  const status = $("#profilePhotoStatus");

  if (!input) {
    console.error("Input foto #profilePhotoFile tidak ditemukan.");
    return;
  }

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      toast("Pilih foto JPG, PNG, atau WEBP.");
      input.value = "";
      selectedProfilePhoto = null;
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast("Ukuran foto maksimal 5 MB.");
      input.value = "";
      selectedProfilePhoto = null;
      return;
    }

    selectedProfilePhoto = file;

    if (profilePhotoPreviewUrl) {
      URL.revokeObjectURL(profilePhotoPreviewUrl);
    }

    profilePhotoPreviewUrl = URL.createObjectURL(file);

    const imageSelectors = [
      "#dialogProfileImage",
      "#profileImage"
    ];

    imageSelectors.forEach((selector) => {
      const img = $(selector);
      if (!img) return;

      const initial = selector === "#profileImage"
        ? $("#profileInitial")
        : $("#dialogProfileInitial");

      img.onload = () => {
        img.classList.remove("hidden");
        if (initial) initial.classList.add("hidden");
      };

      img.onerror = () => {
        img.classList.add("hidden");
        if (initial) initial.classList.remove("hidden");
        console.error("Pratinjau gagal dimuat:", selector);
      };

      img.src = profilePhotoPreviewUrl;
    });

    if (status) {
      status.textContent = `Foto dipilih: ${file.name}. Tekan Simpan perubahan untuk menyimpan.`;
    }
  });
}



async function saveProfile(event) {
  event.preventDefault();

  if (!db || !requireOwner()) return;

  const payload = {
    full_name: $("#inputName")?.value.trim() || "",
    npm: $("#inputNpm")?.value.trim() || "",
    study_program: $("#inputProdi")?.value.trim() || "",
    faculty: $("#inputFakultas")?.value.trim() || "",
    university: $("#inputUniversitas")?.value.trim() || "",
    course_name: $("#inputCourse")?.value.trim() || "",
    description: $("#inputDescription")?.value.trim() || "",
    updated_at: new Date().toISOString()
  };

  const button = $('#profileForm button[type="submit"]');
  if (button) button.disabled = true;

  try {
    const { data, error } = await db
      .from("site_profile")
      .upsert(
        { id: 1, ...payload },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) throw error;

    // Tampilkan foto dari folder assets, bukan Supabase Storage.
    renderProfile(data);

    selectedProfilePhoto = null;

    const input = $("#profilePhotoFile");
    if (input) input.value = "";

    const status = $("#profilePhotoStatus");
    if (status) {
      status.textContent = "Foto menggunakan assets/profil.jpeg.";
    }

    if (profilePhotoPreviewUrl) {
      URL.revokeObjectURL(profilePhotoPreviewUrl);
      profilePhotoPreviewUrl = null;
    }

    $("#profileDialog")?.close();
    toast("Profil berhasil disimpan.");
  } catch (error) {
    console.error("Gagal menyimpan profil:", error);
    toast("Gagal menyimpan profil: " + error.message);
  } finally {
    if (button) button.disabled = false;
  }
}


  function renderReferences() {
    const list = $("#referencesList");
    if (!list) return;

    if (!state.references.length) {
      list.innerHTML =
        '<p class="privacy-note">Belum ada referensi yang ditambahkan.</p>';
      return;
    }

    list.innerHTML = state.references.map((ref, index) => `
      <div class="reference-item">
        <div>
          <b>${esc(ref.title)}</b>
          <p>${esc(
            [ref.author, ref.year, ref.type].filter(Boolean).join(" · ")
          )}</p>
          ${
            ref.url
              ? `<a href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">Buka sumber ↗</a>`
              : ""
          }
          ${ref.note ? `<p>${esc(ref.note)}</p>` : ""}
        </div>
        <button
          type="button"
          data-reference-remove="${index}"
        >Hapus</button>
      </div>
    `).join("");
  }

  function openReference() {
    if (!requireOwner()) return;

    $("#referenceForm")?.reset();
    $("#referenceDialog")?.showModal();
  }

  function saveReference(event) {
    event.preventDefault();
    if (!requireOwner()) return;

    state.references.push({
      title: $("#refTitle")?.value.trim() || "",
      type: $("#refType")?.value || "",
      author: $("#refAuthor")?.value.trim() || "",
      year: $("#refYear")?.value.trim() || "",
      url: $("#refUrl")?.value.trim() || "",
      note: $("#refNote")?.value.trim() || ""
    });

    renderReferences();
    $("#referenceDialog")?.close();

    toast("Referensi ditambahkan sementara, belum disimpan ke database.");
  }

  // LOGIN PEMILIK

  $("#ownerLoginButton")?.addEventListener("click", () => {
    if ($("#ownerLoginMessage")) $("#ownerLoginMessage").textContent = "";
    $("#ownerLoginDialog")?.showModal();
  });

  $("#closeOwnerLogin")?.addEventListener("click", () => {
    $("#ownerLoginDialog")?.close();
  });

  $("#cancelOwnerLogin")?.addEventListener("click", () => {
    $("#ownerLoginDialog")?.close();
  });

  $("#ownerLoginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!db) {
      toast("Supabase belum terhubung. Periksa supabase-config.js.");
      return;
    }

    const button = $("#ownerLoginSubmit");
    if (button) button.disabled = true;

    if ($("#ownerLoginMessage")) {
      $("#ownerLoginMessage").textContent = "Sedang memeriksa akun...";
    }

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: $("#ownerEmail").value.trim(),
        password: $("#ownerPassword").value
      });

      if (error) throw error;

      await setOwnerUI(data.session, true);

      if (!state.isOwner) {
        await db.auth.signOut();
        state.session = null;
        state.isOwner = false;
        await setOwnerUI(null);
        return;
      }

      $("#ownerLoginDialog")?.close();
      $("#ownerLoginForm")?.reset();

      toast("Login berhasil sebagai pemilik.");

      await Promise.all([loadProfile(), loadNotes()]);
    } catch (error) {
      console.error("Login gagal:", error);

      if ($("#ownerLoginMessage")) {
        $("#ownerLoginMessage").textContent =
          "Login gagal: " + error.message;
      }
    } finally {
      if (button) button.disabled = false;
    }
  });

  $("#ownerLogoutButton")?.addEventListener("click", async () => {
    if (!db) return;

    const { error } = await db.auth.signOut();

    if (error) {
      console.error("Logout gagal:", error);
      toast("Logout gagal: " + error.message);
      return;
    }

    await setOwnerUI(null);
    toast("Kamu sudah keluar.");
  });

  // NAVIGASI

  $("#brandHome")?.addEventListener("click", (event) => {
    event.preventDefault();
    showHome();
  });

  $("#openLibraryTop")?.addEventListener("click", showLibrary);
  $("#openLibrary")?.addEventListener("click", showLibrary);
  $("#backHome")?.addEventListener("click", showHome);

  // CATATAN

  $("#newNote")?.addEventListener("click", () => openEditor());
  $("#cancelEditor")?.addEventListener("click", closeEditor);
  $("#cancelEditorBottom")?.addEventListener("click", closeEditor);
  $("#noteForm")?.addEventListener("submit", saveNote);
  $("#searchInput")?.addEventListener("input", renderNotes);

  $("#filterTabs")?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-filter]");
    if (!tab) return;

    state.filter = tab.dataset.filter || "all";

    $$("#filterTabs [data-filter]").forEach((button) => {
      button.classList.toggle("active", button === tab);
    });

    renderNotes();
  });

  $("#notesGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = button.dataset.id;

    const note = state.notes.find(
      (item) => String(item.id) === String(id)
    );

    if (button.dataset.action === "favorite") {
      const list = favorites();

      const next = list.includes(String(id))
        ? list.filter((item) => item !== String(id))
        : [...list, String(id)];

      localStorage.setItem(
        "academicNotesFavorites",
        JSON.stringify(next)
      );

      renderNotes();
    } else if (button.dataset.action === "open") {
      openNote(note);
    } else if (button.dataset.action === "edit") {
      openEditor(note);
    } else if (button.dataset.action === "delete") {
      deleteNote(id);
    }
  });

  $$(".rich-toolbar [data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!requireOwner()) return;

      $("#noteBody")?.focus();

      document.execCommand(
        button.dataset.command,
        false,
        button.dataset.value || null
      );
    });
  });

  $("#insertLink")?.addEventListener("click", () => {
    if (!requireOwner()) return;

    const url = prompt("Masukkan URL tautan:");

    if (url) {
      $("#noteBody")?.focus();
      document.execCommand("createLink", false, url);
    }
  });

  $("#clearFormat")?.addEventListener("click", () => {
    if (!requireOwner()) return;

    $("#noteBody")?.focus();
    document.execCommand("removeFormat", false, null);
  });

  // PROFIL

  $("#editProfile")?.addEventListener("click", async () => {
    if (!requireOwner()) return;

    await loadProfile();

    // Bersihkan pilihan foto sementara setiap kali dialog dibuka.
    selectedProfilePhoto = null;

    if (profilePhotoPreviewUrl) {
      URL.revokeObjectURL(profilePhotoPreviewUrl);
      profilePhotoPreviewUrl = null;
    }

    const input = $("#profilePhotoFile");
    if (input) input.value = "";

    const status = $("#profilePhotoStatus");
    if (status) status.textContent = "";

    $("#profileDialog")?.showModal();
  });

  $("#closeProfile")?.addEventListener("click", () => {
    $("#profileDialog")?.close();
  });

  $("#cancelProfile")?.addEventListener("click", () => {
    $("#profileDialog")?.close();
  });

  $("#profileForm")?.addEventListener("submit", saveProfile);

  // REFERENSI

  $("#addReference")?.addEventListener("click", openReference);

  $("#closeReference")?.addEventListener("click", () => {
    $("#referenceDialog")?.close();
  });

  $("#cancelReference")?.addEventListener("click", () => {
    $("#referenceDialog")?.close();
  });

  $("#referenceForm")?.addEventListener("submit", saveReference);

  $("#referencesList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reference-remove]");
    if (!button) return;

    state.references.splice(
      Number(button.dataset.referenceRemove),
      1
    );

    renderReferences();
  });

  // TAHUN FOOTER

  if ($("#year")) {
    $("#year").textContent = new Date().getFullYear();
  }

  // INISIALISASI SUPABASE

  if (!db) {
    console.error(
      "Supabase client tidak ditemukan. Pastikan supabase-config.js dimuat sebelum script.js."
    );

    toast("Supabase belum terhubung.");
  } else {
    db.auth.getSession().then(async ({ data, error }) => {
      if (error) console.error("getSession:", error);
      await setOwnerUI(data?.session || null);
    });

    db.auth.onAuthStateChange((_event, session) => {
      Promise.resolve().then(() => setOwnerUI(session));
    });

    loadProfile();
    loadNotes();
  }
})();
