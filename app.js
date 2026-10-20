const STORAGE_KEYS = {
  updates: "mtaa-homes-updates",
  concerns: "mtaa-homes-concerns",
  contacts: "mtaa-homes-contacts",
};

const defaultUpdates = [
  {
    id: "welcome-note",
    title: "Welcome to your property desk",
    category: "Community",
    message: "A warm welcome! This is where you can keep up with property news and important notices.",
    createdAt: new Date().toISOString(),
  },
];

let updates = loadItems(STORAGE_KEYS.updates, defaultUpdates);
let concerns = loadItems(STORAGE_KEYS.concerns, []);
let contacts = loadItems(STORAGE_KEYS.contacts, []);
let toastTimeout;

const byId = (id) => document.getElementById(id);

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadItems(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return fallback;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Saved data is not a list.");
    return parsed;
  } catch (error) {
    console.error(`Could not load ${key} from this browser.`, error);
    window.addEventListener("DOMContentLoaded", () => showToast("Some saved information couldn’t be loaded. Check browser storage settings."));
    return fallback;
  }
}

function saveItems(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch (error) {
    console.error(`Could not save ${key} to this browser.`, error);
    showToast("Couldn’t save your changes. Check that browser storage is available.");
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function showToast(message) {
  const toast = byId("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3500);
}

function emptyState(icon, title, description) {
  return `<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">${icon}</span><strong>${title}</strong><p>${description}</p></div>`;
}

function renderUpdates() {
  const sorted = [...updates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  byId("updates-nav-count").textContent = String(updates.length);
  byId("home-update-count").innerHTML = `${updates.length} <span class="stat-unit">posted</span>`;
  byId("updates-count").textContent = String(updates.length);

  byId("home-updates").innerHTML = sorted.length
    ? sorted.slice(0, 3).map((update) => `
      <article class="home-update-item">
        <span class="update-marker" aria-hidden="true"></span>
        <div class="update-item-copy">
          <strong>${escapeHtml(update.title)}</strong>
          <p>${escapeHtml(update.message)}</p>
          <div class="update-item-meta">${formatDate(update.createdAt)}<span class="category-pill">${escapeHtml(update.category)}</span></div>
        </div>
      </article>`).join("")
    : emptyState("✳", "No updates yet", "Your latest property notices will show up here.");

  byId("all-updates").innerHTML = sorted.length
    ? sorted.map((update) => `
      <article class="notice-card">
        <div class="notice-meta">${formatDate(update.createdAt)}<span class="category-pill">${escapeHtml(update.category)}</span></div>
        <h3>${escapeHtml(update.title)}</h3>
        <p>${escapeHtml(update.message)}</p>
      </article>`).join("")
    : emptyState("✳", "Your noticeboard is waiting", "Post your first update and it will appear here.");
}

function renderConcerns() {
  const openCount = concerns.filter((concern) => !concern.resolved).length;
  byId("concerns-nav-count").textContent = String(openCount);
  byId("home-concern-count").innerHTML = `${openCount} <span class="stat-unit">to review</span>`;
  byId("concerns-count").textContent = String(concerns.length);
  const sorted = [...concerns].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  byId("all-concerns").innerHTML = sorted.length
    ? sorted.map((concern) => `
      <article class="concern-card">
        <div class="concern-card-top"><div><h3>${escapeHtml(concern.topic)}</h3><div class="concern-meta">${escapeHtml(concern.name)} · ${escapeHtml(concern.property)} · ${formatDate(concern.createdAt)}</div></div><span class="concern-status${concern.resolved ? " resolved" : ""}">${concern.resolved ? "Resolved" : "Open"}</span></div>
        <p>${escapeHtml(concern.message)}</p>
        ${concern.resolved ? "" : `<button class="resolve-button" type="button" data-resolve="${escapeHtml(concern.id)}">Mark as resolved</button>`}
      </article>`).join("")
    : emptyState("♡", "Nothing in the inbox", "When a client raises a concern, it’ll appear here.");
}

function renderContacts() {
  const contactList = byId("contact-list");
  contactList.innerHTML = contacts.length
    ? contacts.map((contact) => `
      <div class="contact-row">
        <label class="contact-option" for="contact-${escapeHtml(contact.id)}">
          <input id="contact-${escapeHtml(contact.id)}" type="checkbox" name="contact" value="${escapeHtml(contact.id)}" />
          <span class="contact-initial">${escapeHtml(contact.name.trim().slice(0, 1).toUpperCase())}</span>
          <span class="contact-copy"><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.phone)}</small></span>
        </label>
        <button type="button" class="contact-remove" data-remove-contact="${escapeHtml(contact.id)}" aria-label="Remove ${escapeHtml(contact.name)}">×</button>
      </div>`).join("")
    : `<div class="empty-contacts">Add a client’s name and number to get started.</div>`;
}

function navigate(page) {
  const validPages = ["home", "updates", "reminders", "concerns"];
  const target = validPages.includes(page) ? page : "home";
  document.querySelectorAll(".page").forEach((element) => {
    const active = element.id === `page-${target}`;
    element.hidden = !active;
    element.classList.toggle("active-page", active);
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.page === target;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const activeLink = document.querySelector(`.nav-link[data-page="${target}"]`);
  byId("page-crumb").textContent = activeLink ? activeLink.textContent.trim().replace(/\s+\d+$/, "") : "Overview";
  if (window.location.hash !== `#${target}`) history.replaceState(null, "", `#${target}`);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const navigation = target.closest("[data-go], .nav-link");
  if (navigation) {
    event.preventDefault();
    navigate(navigation.dataset.go || navigation.dataset.page);
  }
});

document.getElementById("update-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const next = [{
    id: createId(),
    title: formData.get("title").trim(),
    category: formData.get("category"),
    message: formData.get("message").trim(),
    createdAt: new Date().toISOString(),
  }, ...updates];
  if (!saveItems(STORAGE_KEYS.updates, next)) return;
  updates = next;
  form.reset();
  renderUpdates();
  showToast("Your update has been posted.");
});

document.getElementById("concern-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const next = [{
    id: createId(),
    name: formData.get("name").trim(),
    property: formData.get("property").trim(),
    topic: formData.get("topic"),
    message: formData.get("message").trim(),
    createdAt: new Date().toISOString(),
    resolved: false,
  }, ...concerns];
  if (!saveItems(STORAGE_KEYS.concerns, next)) return;
  concerns = next;
  form.reset();
  renderConcerns();
  showToast("Your concern has been added to the inbox.");
});

byId("all-concerns").addEventListener("click", (event) => {
  const button = event.target.closest("[data-resolve]");
  if (!button) return;
  const next = concerns.map((concern) => concern.id === button.dataset.resolve ? { ...concern, resolved: true } : concern);
  if (!saveItems(STORAGE_KEYS.concerns, next)) return;
  concerns = next;
  renderConcerns();
  showToast("Concern marked as resolved.");
});

byId("add-contact").addEventListener("click", () => {
  const nameInput = byId("contact-name");
  const phoneInput = byId("contact-phone");
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  if (!name || !phone) {
    showToast("Add both a client name and phone number.");
    (name ? phoneInput : nameInput).focus();
    return;
  }
  if (!/^[+\d][\d\s().-]{5,18}$/.test(phone)) {
    showToast("Enter a valid phone number, including its country code if needed.");
    phoneInput.focus();
    return;
  }
  const next = [...contacts, { id: createId(), name, phone }];
  if (!saveItems(STORAGE_KEYS.contacts, next)) return;
  contacts = next;
  nameInput.value = "";
  phoneInput.value = "";
  renderContacts();
  showToast(`${name} added to your client list.`);
});

byId("contact-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-contact]");
  if (!button) return;
  const contact = contacts.find((item) => item.id === button.dataset.removeContact);
  const next = contacts.filter((item) => item.id !== button.dataset.removeContact);
  if (!saveItems(STORAGE_KEYS.contacts, next)) return;
  contacts = next;
  renderContacts();
  if (contact) showToast(`${contact.name} removed from your client list.`);
});

byId("select-all").addEventListener("click", () => {
  const checkboxes = [...byId("contact-list").querySelectorAll('input[name="contact"]')];
  const shouldSelect = checkboxes.some((checkbox) => !checkbox.checked);
  checkboxes.forEach((checkbox) => { checkbox.checked = shouldSelect; });
  byId("select-all").textContent = shouldSelect ? "Clear selection" : "Select all";
});
byId("reminder-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = byId("reminder-message").value.trim();
  if (!message) {
    byId("reminder-message").focus();
    showToast("Write a reminder message first.");
    return;
  }
  const selectedIds = [...byId("contact-list").querySelectorAll('input[name="contact"]:checked')].map((checkbox) => checkbox.value);
  const selectedContacts = contacts.filter((contact) => selectedIds.includes(contact.id));
  if (!selectedContacts.length) {
    showToast("Select at least one client to prepare your reminder.");
    return;
  }
  const recipients = selectedContacts.map((contact) => contact.phone.replace(/[^\d+]/g, "")).join(",");
  const smsUrl = `sms:${recipients}?body=${encodeURIComponent(message)}`;
  window.location.href = smsUrl;
  showToast("Your message draft is ready. Review it before sending.");
});

window.addEventListener("hashchange", () => navigate(window.location.hash.slice(1)));

byId("today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date());
renderUpdates();
renderConcerns();
renderContacts();
navigate(window.location.hash.slice(1) || "home");
