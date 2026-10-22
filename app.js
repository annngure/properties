const STORAGE_KEYS = {
  updates: "mtaa-homes-updates",
  concerns: "mtaa-homes-concerns",
  contacts: "mtaa-homes-contacts",
  properties: "mtaa-homes-properties",
  accounts: "mtaa-homes-accounts",
  staffContacts: "mtaa-homes-staff-contacts",
  reminders: "mtaa-homes-scheduled-reminders",
};

const DEFAULT_STAFF_CONTACTS = [];
const AUTH_SESSION_KEY = "mtaa-homes-auth-session";
const PASSWORD_ITERATIONS = 160000;
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
let properties = loadItems(STORAGE_KEYS.properties, []);
let accounts = loadItems(STORAGE_KEYS.accounts, []);
let staffContacts = loadItems(STORAGE_KEYS.staffContacts, DEFAULT_STAFF_CONTACTS);
let reminders = loadItems(STORAGE_KEYS.reminders, []);
let authRole = "client";
let authMode = "signin";
let role = "client";
let currentAccount = null;
let clientName = "";
let toastTimeout;

const byId = (id) => document.getElementById(id);

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadItems(key, fallback) {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return fallback;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Saved data is not a list.");
    return parsed;
  } catch (error) {
    console.error(`Could not load ${key} from this browser.`, error);
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const notify = () => showToast("Some saved information couldn’t be loaded. Check browser storage settings.");
      if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", notify, { once: true });
      else notify();
    }
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

function showAuthFeedback(message, isError = true) {
  const feedback = byId("auth-feedback");
  feedback.textContent = message;
  feedback.hidden = !message;
  feedback.classList.toggle("auth-feedback-error", isError);
  feedback.classList.toggle("auth-feedback-success", !isError);
}

function normalizePhone(value) {
  return value.replace(/[^\d]/g, "");
}

function normalizeIdentifier(value) {
  return value.trim().toLocaleLowerCase();
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  if (!window.crypto?.subtle) {
    throw new Error("Secure password hashing is unavailable in this browser. Open the app on localhost or HTTPS.");
  }
  const encoder = new TextEncoder();
  const key = await window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

async function makePasswordRecord(password) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), passwordHash: await hashPassword(password, salt) };
}

async function verifyPassword(password, account) {
  const salt = Uint8Array.from(account.salt.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
  return await hashPassword(password, salt) === account.passwordHash;
}

function configureAuthForm() {
  document.querySelectorAll("[data-auth-role]").forEach((button) => {
    const active = button.dataset.authRole === authRole;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    const active = button.dataset.authMode === authMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-auth-role-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.authRolePanel !== authRole;
  });
  document.querySelectorAll("[data-auth-mode-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.authModePanel !== authMode;
  });

  const isClient = authRole === "client";
  const isSignup = authMode === "signup";
  byId("auth-client-name").required = isClient && isSignup;
  byId("auth-client-phone").required = isClient;
  byId("auth-client-unit").required = isClient;
  byId("auth-admin-identifier").required = !isClient;
  byId("auth-confirm-password").required = isSignup;
  byId("auth-password").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
  byId("auth-submit").textContent = isSignup ? "Create account" : "Sign in";
  byId("auth-title").innerHTML = isSignup
    ? 'Make yourself at home<span class="title-period">.</span>'
    : 'Good to see you<span class="title-period">.</span>';
  byId("auth-subtitle").textContent = isSignup
    ? "Create your front-end demo account to access your property desk."
    : "Your properties, the latest notices, and support from your property team.";
  byId("auth-demo-note").textContent = authRole === "admin" && isSignup
    ? "Front-end demo only: anyone with access to this page can create an admin account. Do not use this as production authentication."
    : "Front-end demo only: accounts are stored in this browser and are not shared between devices.";
  byId("auth-form").reset();
  showAuthFeedback("");
}

function openWorkspace(account) {
  currentAccount = account;
  role = account.role;
  clientName = account.role === "client" ? account.name : "";
  try {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ id: account.id, role: account.role }));
  } catch (error) {
    console.error("Could not save this browser session.", error);
    showAuthFeedback("Could not start your session. Check this browser’s storage settings.");
    currentAccount = null;
    return false;
  }
  byId("auth-screen").hidden = true;
  byId("app-shell").hidden = false;
  byId("auth-form").reset();
  updateWorkspace();
  renderUpdates();
  renderConcerns();
  renderProperties();
  renderContacts();
  renderStaffContacts();
  renderScheduledReminders();
  navigate("home");
  showToast(`Signed in as ${account.role === "admin" ? "admin" : account.name}.`);
  return true;
}

function clearWorkspaceSession() {
  try {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch (error) {
    console.error("Could not clear this browser session.", error);
  }
}

function restoreWorkspaceSession() {
  try {
    const saved = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!saved) return;
    const session = JSON.parse(saved);
    const account = accounts.find((item) => item.id === session.id && item.role === session.role);
    if (account) {
      currentAccount = account;
      role = account.role;
      clientName = account.role === "client" ? account.name : "";
      return;
    }
    clearWorkspaceSession();
  } catch (error) {
    console.error("Could not restore this browser session.", error);
    clearWorkspaceSession();
  }
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  showAuthFeedback("");

  const formData = new FormData(form);
  const password = formData.get("password");
  try {
    if (authMode === "signup") {
      const identity = authRole === "client"
        ? {
          name: formData.get("clientName").trim(),
          phone: formData.get("clientPhone").trim(),
          propertyUnit: formData.get("clientUnit").trim(),
        }
        : { identifier: formData.get("adminIdentifier").trim() };
      if (password !== formData.get("confirmPassword")) {
        showAuthFeedback("The passwords do not match.");
        byId("auth-confirm-password").focus();
        return;
      }
      if (authRole === "client" && !/^[+\d][\d\s().-]{5,18}$/.test(identity.phone)) {
        showAuthFeedback("Enter a valid phone number, including its country code if needed.");
        byId("auth-client-phone").focus();
        return;
      }
      const duplicate = accounts.some((account) => authRole === "client"
        ? account.role === "client"
          && normalizePhone(account.phone) === normalizePhone(identity.phone)
          && normalizeIdentifier(account.propertyUnit) === normalizeIdentifier(identity.propertyUnit)
        : account.role === "admin" && normalizeIdentifier(account.identifier) === normalizeIdentifier(identity.identifier));
      if (duplicate) {
        showAuthFeedback(authRole === "client"
          ? "An account already exists for this phone number and property unit. Please sign in."
          : "An admin account with this email or ID already exists. Please sign in.");
        return;
      }

      const passwordRecord = await makePasswordRecord(password);
      const account = {
        id: createId(),
        role: authRole,
        ...identity,
        ...passwordRecord,
        createdAt: new Date().toISOString(),
      };
      const next = [...accounts, account];
      if (!saveItems(STORAGE_KEYS.accounts, next)) return;
      accounts = next;
      if (openWorkspace(account)) showToast("Your account is ready.");
      return;
    }

    const account = authRole === "client"
      ? accounts.find((item) => item.role === "client"
        && normalizePhone(item.phone) === normalizePhone(formData.get("clientPhone"))
        && normalizeIdentifier(item.propertyUnit) === normalizeIdentifier(formData.get("clientUnit")))
      : accounts.find((item) => item.role === "admin"
        && normalizeIdentifier(item.identifier) === normalizeIdentifier(formData.get("adminIdentifier")));
    if (!account || !await verifyPassword(password, account)) {
      showAuthFeedback(authRole === "client"
        ? "Those details don’t match a client account in this browser."
        : "That email or ID and password don’t match an admin account in this browser.");
      return;
    }
    openWorkspace(account);
  } catch (error) {
    console.error("Could not complete sign-in or sign-up.", error);
    showAuthFeedback(error.message || "Could not complete that request. Please try again.");
  }
}

function emptyState(icon, title, description) {
  return `<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">${icon}</span><strong>${title}</strong><p>${description}</p></div>`;
}

function sortedByDate(items) {
  return [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function scheduledDateValue(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function sortedBySchedule(items) {
  return [...items].sort((a, b) => {
    const scheduleDifference = scheduledDateValue(a.scheduledDate) - scheduledDateValue(b.scheduledDate);
    return scheduleDifference || new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function sortedConcernsByUrgency(items) {
  return [...items].sort((a, b) => {
    if (a.resolved !== b.resolved) return Number(a.resolved) - Number(b.resolved);
    const scheduleDifference = scheduledDateValue(a.scheduledDate) - scheduledDateValue(b.scheduledDate);
    return scheduleDifference || new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function formatScheduledDate(value) {
  return value ? formatDate(`${value}T00:00:00`) : "No scheduled date";
}

function getClientConcerns() {
  if (currentAccount?.role === "client") {
    return concerns.filter((concern) => concern.accountId
      ? concern.accountId === currentAccount.id
      : concern.name.trim().toLocaleLowerCase() === clientName.trim().toLocaleLowerCase());
  }
  return [];
}

function renderUpdates() {
  const sorted = sortedByDate(updates);
  const markup = sorted.length
    ? sorted.map((update) => `
      <article class="notice-card">
        <div class="notice-meta">${formatDate(update.createdAt)}<span class="category-pill">${escapeHtml(update.category)}</span></div>
        <h3>${escapeHtml(update.title)}</h3>
        <p>${escapeHtml(update.message)}</p>
      </article>`).join("")
    : emptyState("✳", "Your noticeboard is waiting", "The property team’s latest notices will appear here.");
  const homeMarkup = sorted.length
    ? sorted.slice(0, 3).map((update) => `
      <article class="home-update-item">
        <span class="update-marker" aria-hidden="true"></span>
        <div class="update-item-copy">
          <strong>${escapeHtml(update.title)}</strong>
          <p>${escapeHtml(update.message)}</p>
          <div class="update-item-meta">${formatDate(update.createdAt)}<span class="category-pill">${escapeHtml(update.category)}</span></div>
        </div>
      </article>`).join("")
    : emptyState("✳", "No updates yet", "The property team’s latest notices will show up here.");

  document.querySelectorAll("#home-update-count").forEach((element) => {
    element.innerHTML = `${updates.length} <span class="stat-unit">posted</span>`;
  });
  byId("updates-nav-count").textContent = String(updates.length);
  byId("updates-count").textContent = String(updates.length);
  byId("all-updates").innerHTML = markup;
  byId("home-updates").innerHTML = homeMarkup;
  byId("admin-home-updates").innerHTML = homeMarkup;
}

function concernCard(concern, isAdmin) {
  const assignedStaff = concern.assignedStaff || "";
  const staffContact = staffContacts.find((member) => member.name === assignedStaff);
  const staffDisplay = assignedStaff
    ? `<span>${escapeHtml(assignedStaff)}</span><small>${staffContact?.phone ? escapeHtml(staffContact.phone) : ""}${staffContact?.phone && staffContact?.email ? " · " : ""}${staffContact?.email ? escapeHtml(staffContact.email) : !staffContact?.phone ? "Contact details not provided yet" : ""}</small>`
    : "<span>Not assigned yet</span>";
  const availableStaff = [...new Set([...staffContacts.map((member) => member.name), assignedStaff].filter(Boolean))];
  const adminControls = isAdmin ? `
    <label class="assignment-control">Assigned staff
      <select data-assign-concern="${escapeHtml(concern.id)}" aria-label="Assign staff for ${escapeHtml(concern.topic)}"${concern.resolved ? " disabled" : ""}>
        <option value="">Unassigned</option>
        ${availableStaff.map((member) => `<option value="${escapeHtml(member)}"${assignedStaff === member ? " selected" : ""}>${escapeHtml(member)}</option>`).join("")}
      </select>
    </label>
    ${concern.resolved ? "" : `<button class="resolve-button" type="button" data-resolve="${escapeHtml(concern.id)}">Mark as resolved</button>`}` : `
    <div class="assigned-staff"><strong>Assigned staff</strong>${staffDisplay}</div>`;
  const scheduled = concern.scheduledDate
    ? `<div class="scheduled-date${!concern.resolved && scheduledDateValue(concern.scheduledDate) <= new Date().setHours(0, 0, 0, 0) ? " urgent" : ""}">Scheduled: ${formatScheduledDate(concern.scheduledDate)}</div>`
    : "";
  const scheduleControl = isAdmin
    ? `<label class="assignment-control">Scheduled date<input type="date" data-schedule-concern="${escapeHtml(concern.id)}" value="${escapeHtml(concern.scheduledDate || "")}"${concern.resolved ? " disabled" : ""} /></label>`
    : "";

  return `<article class="concern-card">
    <div class="concern-card-top"><div><h3>${escapeHtml(concern.topic)}</h3><div class="concern-meta">${escapeHtml(concern.name)} · ${escapeHtml(concern.property)} · ${formatDate(concern.createdAt)}</div></div><span class="concern-status${concern.resolved ? " resolved" : ""}">${concern.resolved ? "Resolved" : "Open"}</span></div>
    <p>${escapeHtml(concern.message)}</p>
    ${scheduled}
    ${scheduleControl}
    ${adminControls}
  </article>`;
}

function renderConcerns() {
  const clientConcerns = getClientConcerns();
  const openCount = concerns.filter((concern) => !concern.resolved).length;
  const clientOpenCount = clientConcerns.filter((concern) => !concern.resolved).length;
  byId("concerns-nav-count").textContent = String(role === "admin" ? openCount : clientOpenCount);
  byId("home-concern-count").innerHTML = `${role === "admin" ? openCount : clientOpenCount} <span class="stat-unit">${role === "admin" ? "to review" : "open"}</span>`;
  byId("concerns-count").textContent = String(clientConcerns.length);
  byId("admin-concerns-count").textContent = String(concerns.length);

  byId("all-concerns").innerHTML = clientConcerns.length
    ? sortedConcernsByUrgency(clientConcerns).map((concern) => concernCard(concern, false)).join("")
    : emptyState("♡", clientName ? "Nothing in your inbox" : "Select your client name first", clientName ? "Concerns you submit will appear here with their assigned staff." : "Enter the client name used by the property team on your overview.");
  byId("admin-concerns").innerHTML = concerns.length
    ? sortedConcernsByUrgency(concerns).map((concern) => concernCard(concern, true)).join("")
    : emptyState("♡", "Nothing in the inbox", "When a client raises a concern, it’ll appear here.");
  byId("home-concerns").innerHTML = concerns.length
    ? sortedConcernsByUrgency(concerns).slice(0, 3).map((concern) => `
      <article class="notice-card">
        <div class="notice-meta">${escapeHtml(concern.name)} · ${formatDate(concern.createdAt)}<span class="concern-status${concern.resolved ? " resolved" : ""}">${concern.resolved ? "Resolved" : "Open"}</span></div>
        <h3>${escapeHtml(concern.topic)}</h3>
        <p>${escapeHtml(concern.message)}</p>
      </article>`).join("")
    : emptyState("♡", "No concerns yet", "Client concerns will appear here when submitted.");
}

function renderProperties() {
  const clientProperties = currentAccount?.role === "client"
    ? properties.filter((property) => property.clientId
      ? property.clientId === currentAccount.id
      : property.client?.trim().toLocaleLowerCase() === clientName.trim().toLocaleLowerCase())
    : [];
  const registeredUnit = currentAccount?.role === "client" ? currentAccount.propertyUnit : "";
  const portfolio = clientProperties.length
    ? clientProperties.map((property) => `
      <article class="property-card">
        <span class="property-card-icon" aria-hidden="true">⌂</span>
        <div><strong>${escapeHtml(property.name)}</strong><p>${escapeHtml(property.unit)}</p></div>
      </article>`).join("")
    : registeredUnit
      ? `<article class="property-card">
          <span class="property-card-icon" aria-hidden="true">⌂</span>
          <div><strong>Your registered unit</strong><p>${escapeHtml(registeredUnit)} · Full property details will appear when linked by the property team.</p></div>
        </article>`
      : emptyState("⌂", clientName ? "No properties linked yet" : "Sign in to view your portfolio", "Your registered properties will appear here.");
  byId("properties-nav-count").textContent = String(properties.length);
  byId("properties-count").textContent = String(properties.length);
  const visiblePropertyCount = role === "admin" ? properties.length : clientProperties.length || (registeredUnit ? 1 : 0);
  byId("home-property-count").innerHTML = `${visiblePropertyCount} <span class="stat-unit">properties</span>`;

  byId("client-properties").innerHTML = portfolio;
  byId("all-properties").innerHTML = properties.length
    ? sortedByDate(properties).map((property) => `
      <article class="property-card">
        <span class="property-card-icon" aria-hidden="true">⌂</span>
        <div><strong>${escapeHtml(property.name)}</strong><p>${escapeHtml(property.unit)} · Client: ${escapeHtml(accounts.find((account) => account.id === property.clientId)?.name || property.client || "Unlinked client")}</p></div>
        <button type="button" class="contact-remove" data-remove-property="${escapeHtml(property.id)}" aria-label="Remove ${escapeHtml(property.name)}">×</button>
      </article>`).join("")
    : emptyState("⌂", "No properties added", "Use the form to add a property to a client portfolio.");
  const clientOptions = accounts.filter((account) => account.role === "client");
  byId("property-client").innerHTML = clientOptions.length
    ? `<option value="">Choose a registered client</option>${clientOptions.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(account.propertyUnit)}</option>`).join("")}`
    : '<option value="">No registered clients yet</option>';
  byId("property-client").value = "";
  updateSelectedClientFields();
  byId("property-client").disabled = clientOptions.length === 0;
  byId("property-form").querySelector('button[type="submit"]').disabled = clientOptions.length === 0;
  renderClientDirectory();
}

function updateSelectedClientFields() {
  const client = accounts.find((account) => account.role === "client" && account.id === byId("property-client").value);
  byId("selected-client-name").value = client?.name || "";
  byId("selected-client-phone").value = client?.phone || "";
  byId("selected-client-unit").value = client?.propertyUnit || "";
}

function renderClientDirectory() {
  const clients = accounts.filter((account) => account.role === "client");
  byId("clients-count").textContent = String(clients.length);
  byId("client-directory").innerHTML = clients.length
    ? clients.map((account) => `
      <article class="property-card">
        <span class="property-card-icon" aria-hidden="true">${escapeHtml(account.name.trim().slice(0, 1).toUpperCase())}</span>
        <div><strong>${escapeHtml(account.name)}</strong><p>${escapeHtml(account.phone)} · ${escapeHtml(account.propertyUnit)}</p></div>
        <button type="button" class="contact-remove" data-remove-client="${escapeHtml(account.id)}" aria-label="Delete client ${escapeHtml(account.name)}">×</button>
      </article>`).join("")
    : emptyState("♡", "No client accounts yet", "New client sign-ups will appear here.");
}

function renderContacts() {
  const contactList = byId("contact-list");
  const registeredClients = accounts
    .filter((account) => account.role === "client")
    .map((account) => ({
      id: `account-${account.id}`,
      name: account.name,
      phone: account.phone,
      registered: true,
    }));
  const registeredPhones = new Set(registeredClients.map((contact) => normalizePhone(contact.phone)));
  const recipients = [
    ...registeredClients,
    ...contacts.filter((contact) => !registeredPhones.has(normalizePhone(contact.phone))),
  ];
  contactList.innerHTML = recipients.length
    ? recipients.map((contact) => `
      <div class="contact-row">
        <label class="contact-option" for="contact-${escapeHtml(contact.id)}">
          <input id="contact-${escapeHtml(contact.id)}" type="checkbox" name="contact" value="${escapeHtml(contact.id)}" />
          <span class="contact-initial">${escapeHtml(contact.name.trim().slice(0, 1).toUpperCase())}</span>
          <span class="contact-copy"><strong>${escapeHtml(contact.name)}${contact.registered ? " · Client" : ""}</strong><small>${escapeHtml(contact.phone)}</small></span>
        </label>
        ${contact.registered ? "" : `<button type="button" class="contact-remove" data-remove-contact="${escapeHtml(contact.id)}" aria-label="Remove ${escapeHtml(contact.name)}">×</button>`}
      </div>`).join("")
    : `<div class="empty-contacts">Add a client’s name and number to get started.</div>`;
}

function renderStaffContacts() {
  byId("staff-directory").innerHTML = staffContacts.length
    ? staffContacts.map((contact) => `
      <article class="property-card">
        <span class="property-card-icon" aria-hidden="true">${escapeHtml(contact.name.trim().slice(0, 1).toUpperCase())}</span>
        <div><strong>${escapeHtml(contact.name)}</strong><p>${escapeHtml([contact.phone, contact.email].filter(Boolean).join(" · "))}</p></div>
        <button type="button" class="contact-remove" data-remove-staff="${escapeHtml(contact.name)}" aria-label="Remove ${escapeHtml(contact.name)}">×</button>
      </article>`).join("")
    : emptyState("♡", "No staff contacts added", "Enter a staff member’s name and contact details above.");
}

function renderScheduledReminders() {
  const scheduled = sortedBySchedule(reminders);
  byId("reminders-count").textContent = String(scheduled.length);
  byId("scheduled-reminders").innerHTML = scheduled.length
    ? scheduled.map((reminder) => `
      <article class="notice-card">
        <div class="notice-meta">${formatScheduledDate(reminder.scheduledDate)}<span class="category-pill">${reminder.recipients.length} recipient${reminder.recipients.length === 1 ? "" : "s"}</span></div>
        <p>${escapeHtml(reminder.message)}</p>
      </article>`).join("")
    : emptyState("↗", "No reminders prepared", "Scheduled group reminder drafts will appear here.");
}

function updateWorkspace() {
  document.body.dataset.role = role;
  document.querySelectorAll("[data-role-panel]").forEach((panel) => {
    const roles = panel.dataset.rolePanel.split(",");
    panel.hidden = !roles.includes(role);
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.hidden = !link.dataset.roles.split(",").includes(role);
  });
  const isAdmin = role === "admin";
  byId("workspace-label").textContent = isAdmin ? "ADMIN WORKSPACE" : "CLIENT WORKSPACE";
  byId("profile-name").textContent = isAdmin ? "Property team" : clientName || "Client portal";
  byId("profile-role").textContent = isAdmin ? "Administrator" : "Client workspace";
  byId("top-avatar").textContent = isAdmin ? "MH" : (clientName.trim().slice(0, 2).toUpperCase() || "CL");
  byId("top-avatar").setAttribute("aria-label", isAdmin ? "Property team" : clientName || "Client portal");
  byId("client-home-name").textContent = clientName || "Client";
  byId("client-home-unit").textContent = currentAccount?.role === "client" ? currentAccount.propertyUnit : "";
  byId("concern-name").value = currentAccount?.role === "client" ? currentAccount.name : "";
  byId("concern-name").readOnly = currentAccount?.role === "client";
  byId("concern-property").value = currentAccount?.role === "client" ? currentAccount.propertyUnit : "";
  byId("concern-property").readOnly = currentAccount?.role === "client";
  renderConcerns();
  renderProperties();
}

function allowedPages() {
  return role === "admin"
    ? ["home", "properties", "updates", "reminders", "concerns"]
    : ["home", "updates", "concerns"];
}

function navigate(page, addHistory = false) {
  const target = allowedPages().includes(page) ? page : "home";
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
  const pageTitle = target === "home" ? "Overview" : (activeLink?.textContent.trim().replace(/\s+\d+$/, "") || "Overview");
  byId("page-crumb").textContent = pageTitle;
  if (window.location.hash !== `#${target}`) {
    if (addHistory) history.pushState(null, "", `#${target}`);
    else history.replaceState(null, "", `#${target}`);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const authRoleButton = target.closest("[data-auth-role]");
  if (authRoleButton) {
    authRole = authRoleButton.dataset.authRole;
    configureAuthForm();
    return;
  }
  const authModeButton = target.closest("[data-auth-mode]");
  if (authModeButton) {
    authMode = authModeButton.dataset.authMode;
    configureAuthForm();
    return;
  }
  const navigation = target.closest("[data-go], .nav-link");
  if (navigation) {
    event.preventDefault();
    navigate(navigation.dataset.go || navigation.dataset.page, true);
  }
});

byId("auth-form").addEventListener("submit", submitAuth);

byId("sign-out").addEventListener("click", () => {
  clearWorkspaceSession();
  currentAccount = null;
  clientName = "";
  role = "client";
  authRole = "client";
  authMode = "signin";
  byId("app-shell").hidden = true;
  byId("auth-screen").hidden = false;
  configureAuthForm();
});

byId("property-client").addEventListener("change", updateSelectedClientFields);

byId("property-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (role !== "admin") return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const client = accounts.find((account) => account.role === "client" && account.id === formData.get("clientId"));
  if (!client) {
    showToast("Select a registered client before adding this property.");
    return;
  }
  const next = [{
    id: createId(),
    name: formData.get("name").trim(),
    unit: formData.get("unit").trim(),
    client: client.name,
    clientId: client.id,
    createdAt: new Date().toISOString(),
  }, ...properties];
  if (!saveItems(STORAGE_KEYS.properties, next)) return;
  properties = next;
  form.reset();
  renderProperties();
  showToast("Property added to the client portfolio.");
});

byId("update-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (role !== "admin") return;
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

byId("concern-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (role !== "client") return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const next = [{
    id: createId(),
    accountId: currentAccount.id,
    name: currentAccount.name,
    property: formData.get("property").trim(),
    topic: formData.get("topic"),
    message: formData.get("message").trim(),
    scheduledDate: formData.get("scheduledDate"),
    assignedStaff: "",
    createdAt: new Date().toISOString(),
    resolved: false,
  }, ...concerns];
  if (!saveItems(STORAGE_KEYS.concerns, next)) return;
  concerns = next;
  clientName = currentAccount.name;
  form.reset();
  updateWorkspace();
  renderConcerns();
  showToast("Your concern has been sent to the property team.");
});

byId("admin-concerns").addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || role !== "admin") return;
  const scheduleInput = target.closest("[data-schedule-concern]");
  if (scheduleInput) {
    const concern = concerns.find((item) => item.id === scheduleInput.dataset.scheduleConcern);
    if (!concern || concern.resolved) return;
    const next = concerns.map((item) => item.id === concern.id
      ? { ...item, scheduledDate: scheduleInput.value }
      : item);
    if (!saveItems(STORAGE_KEYS.concerns, next)) return;
    concerns = next;
    renderConcerns();
    showToast(scheduleInput.value ? `Concern scheduled for ${formatScheduledDate(scheduleInput.value)}.` : "Concern schedule cleared.");
    return;
  }
  const select = target.closest("[data-assign-concern]");
  if (!select) return;
  const concern = concerns.find((item) => item.id === select.dataset.assignConcern);
  if (!concern || concern.resolved) return;
  const next = concerns.map((concern) => concern.id === select.dataset.assignConcern
    ? { ...concern, assignedStaff: select.value }
    : concern);
  if (!saveItems(STORAGE_KEYS.concerns, next)) return;
  concerns = next;
  renderConcerns();
  showToast(select.value ? `Concern assigned to ${select.value}.` : "Concern assignment cleared.");
});

byId("admin-concerns").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || role !== "admin") return;
  const button = target.closest("[data-resolve]");
  if (!button) return;
  const selectedConcern = concerns.find((concern) => concern.id === button.dataset.resolve);
  if (!selectedConcern || selectedConcern.resolved) return;
  const next = concerns.map((concern) => concern.id === button.dataset.resolve ? { ...concern, resolved: true } : concern);
  if (!saveItems(STORAGE_KEYS.concerns, next)) return;
  concerns = next;
  renderConcerns();
  showToast("Concern marked as resolved.");
});

byId("all-properties").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || role !== "admin") return;
  const button = target.closest("[data-remove-property]");
  if (!button) return;
  const next = properties.filter((property) => property.id !== button.dataset.removeProperty);
  if (!saveItems(STORAGE_KEYS.properties, next)) return;
  properties = next;
  renderProperties();
  showToast("Property removed from the portfolio.");
});

byId("client-directory").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || role !== "admin") return;
  const button = target.closest("[data-remove-client]");
  if (!button) return;
  const account = accounts.find((item) => item.id === button.dataset.removeClient && item.role === "client");
  if (!account || !window.confirm(`Delete ${account.name}’s client account?`)) return;
  const nextAccounts = accounts.filter((item) => item.id !== account.id);
  const nextProperties = properties.filter((property) => property.clientId
    ? property.clientId !== account.id
    : property.client?.trim().toLocaleLowerCase() !== account.name.trim().toLocaleLowerCase());
  if (!saveItems(STORAGE_KEYS.accounts, nextAccounts)) return;
  if (!saveItems(STORAGE_KEYS.properties, nextProperties)) {
    saveItems(STORAGE_KEYS.accounts, accounts);
    return;
  }
  accounts = nextAccounts;
  properties = nextProperties;
  renderProperties();
  renderContacts();
  showToast(`${account.name}’s account and linked properties were deleted.`);
});

byId("staff-contact-form").addEventListener("submit", (event) => {
  const form = event.target;
  if (role !== "admin") return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const name = formData.get("name").trim();
  const phone = formData.get("phone").trim();
  const email = formData.get("email").trim();
  if (!phone && !email) {
    showToast("Enter a phone number or email address for this staff member.");
    byId("staff-phone").focus();
    return;
  }
  if (phone && !/^[+\d][\d\s().-]{5,18}$/.test(phone)) {
    showToast("Enter a valid phone number, including its country code if needed.");
    byId("staff-phone").focus();
    return;
  }
  const existing = staffContacts.find((item) => normalizeIdentifier(item.name) === normalizeIdentifier(name));
  const next = staffContacts.filter((item) => normalizeIdentifier(item.name) !== normalizeIdentifier(name));
  next.push({ id: existing?.id || createId(), name, phone, email });
  if (!saveItems(STORAGE_KEYS.staffContacts, next)) return;
  staffContacts = next;
  form.reset();
  renderStaffContacts();
  renderConcerns();
  showToast(`${name}’s contact details were saved.`);
});

byId("staff-directory").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || role !== "admin") return;
  const button = target.closest("[data-remove-staff]");
  if (!button) return;
  const name = button.dataset.removeStaff;
  const next = staffContacts.filter((item) => item.name !== name);
  if (!saveItems(STORAGE_KEYS.staffContacts, next)) return;
  staffContacts = next;
  renderStaffContacts();
  renderConcerns();
  showToast(`${name} was removed from the staff directory.`);
});

byId("add-contact").addEventListener("click", () => {
  if (role !== "admin") return;
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
  const target = event.target;
  if (!(target instanceof Element) || role !== "admin") return;
  const button = target.closest("[data-remove-contact]");
  if (!button) return;
  const contact = contacts.find((item) => item.id === button.dataset.removeContact);
  const next = contacts.filter((item) => item.id !== button.dataset.removeContact);
  if (!saveItems(STORAGE_KEYS.contacts, next)) return;
  contacts = next;
  renderContacts();
  if (contact) showToast(`${contact.name} removed from your client list.`);
});

byId("select-all").addEventListener("click", () => {
  if (role !== "admin") return;
  const checkboxes = [...byId("contact-list").querySelectorAll('input[name="contact"]')];
  const shouldSelect = checkboxes.some((checkbox) => !checkbox.checked);
  checkboxes.forEach((checkbox) => { checkbox.checked = shouldSelect; });
  byId("select-all").textContent = shouldSelect ? "Clear selection" : "Select all";
});

byId("reminder-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (role !== "admin") return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const message = byId("reminder-message").value.trim();
  if (!message) {
    byId("reminder-message").focus();
    showToast("Write a reminder message first.");
    return;
  }
  const selectedIds = [...byId("contact-list").querySelectorAll('input[name="contact"]:checked')].map((checkbox) => checkbox.value);
  const registeredClients = accounts
    .filter((account) => account.role === "client")
    .map((account) => ({ id: `account-${account.id}`, phone: account.phone }));
  const registeredPhones = new Set(registeredClients.map((contact) => normalizePhone(contact.phone)));
  const selectedContacts = [
    ...registeredClients,
    ...contacts.filter((contact) => !registeredPhones.has(normalizePhone(contact.phone))),
  ].filter((contact) => selectedIds.includes(contact.id));
  if (!selectedContacts.length) {
    showToast("Select at least one client to prepare your reminder.");
    return;
  }
  const scheduledDate = byId("reminder-scheduled-date").value;
  const nextReminders = [{
    id: createId(),
    message,
    scheduledDate,
    recipients: selectedContacts.map((contact) => contact.id),
    createdAt: new Date().toISOString(),
  }, ...reminders];
  if (!saveItems(STORAGE_KEYS.reminders, nextReminders)) return;
  reminders = nextReminders;
  renderScheduledReminders();
  const recipients = selectedContacts.map((contact) => contact.phone.replace(/[^\d+]/g, "")).join(",");
  const smsUrl = `sms:${recipients}?body=${encodeURIComponent(message)}`;
  window.location.href = smsUrl;
  showToast(scheduledDate
    ? `Reminder saved for ${formatScheduledDate(scheduledDate)}. Review and send the draft yourself.`
    : "Your message draft is ready. Review it before sending.");
});

window.addEventListener("hashchange", () => navigate(window.location.hash.slice(1)));
window.addEventListener("popstate", () => navigate(window.location.hash.slice(1)));

byId("today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date());
configureAuthForm();
restoreWorkspaceSession();
renderUpdates();
renderConcerns();
renderProperties();
renderContacts();
renderStaffContacts();
renderScheduledReminders();
updateWorkspace();
if (currentAccount) {
  byId("auth-screen").hidden = true;
  byId("app-shell").hidden = false;
  navigate(window.location.hash.slice(1) || "home");
} else {
  byId("auth-screen").hidden = false;
  byId("app-shell").hidden = true;
}
}
