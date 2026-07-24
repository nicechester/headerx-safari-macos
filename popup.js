const jsonBox = document.getElementById("jsonBox");
const headerList = document.getElementById("headerList");
const viewJsonBtn = document.getElementById("viewJsonBtn");
const viewListBtn = document.getElementById("viewListBtn");
const applyBtn = document.getElementById("applyBtn");
const enabledToggle = document.getElementById("enabledToggle");
const statusDiv = document.getElementById("status");
const profileCombo = document.getElementById("profileCombo");
const profileOptions = document.getElementById("profileOptions");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const deleteProfileBtn = document.getElementById("deleteProfileBtn");

let headers = [];   // [{ name, value, enabled }]
let profiles = {};
let activeProfile = "";
let viewMode = "json";
let editingIndex = null;
let suppressProfileChange = false;

async function loadState() {
  const state = await browser.storage.local.get([
    "headers",
    "enabled",
    "profiles",
    "viewMode",
    "activeProfile"
  ]);
  headers = normalizeHeaders(state.headers || []);
  profiles = state.profiles || {};
  activeProfile = state.activeProfile || "";
  enabledToggle.checked = state.enabled || false;
  jsonBox.value = headers.length > 0 ? serializeHeaders(headers) : "";
  setProfileComboValue(activeProfile);
  renderProfiles();
  setView(state.viewMode || "json");
}

// Older saved headers have no per-header enabled flag; default them to on
function normalizeHeaders(list) {
  return list.map(h => ({ ...h, enabled: h.enabled !== false }));
}

// --- View switching ---

function setView(mode) {
  viewMode = mode;
  viewJsonBtn.classList.toggle("active", mode === "json");
  viewListBtn.classList.toggle("active", mode === "list");
  jsonBox.style.display = mode === "json" ? "" : "none";
  applyBtn.style.display = mode === "json" ? "" : "none";
  headerList.style.display = mode === "list" ? "" : "none";
  if (mode === "list") {
    renderList();
  }
  chrome.storage.local.set({ viewMode: mode });
}

viewJsonBtn.addEventListener("click", () => {
  if (viewMode === "json") return;
  editingIndex = null;
  jsonBox.value = headers.length > 0 ? serializeHeaders(headers) : "";
  setView("json");
});

viewListBtn.addEventListener("click", () => {
  if (viewMode === "list") return;
  // The textarea is the source of truth in JSON view — parse it before leaving
  try {
    headers = parseHeaders(jsonBox.value);
  } catch (err) {
    showStatus(`Fix the JSON before switching views: ${err.message}`, "error");
    return;
  }
  setView("list");
});

// --- List view ---

function renderList() {
  headerList.innerHTML = "";

  if (headers.length === 0) {
    headerList.innerHTML = '<div class="empty-list">No headers — add them in the JSON view</div>';
    return;
  }

  headers.forEach((header, index) => {
    const row = document.createElement("div");
    const isEditing = index === editingIndex;
    row.className = "header-row" + (header.enabled ? "" : " off") + (isEditing ? " editing" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = header.enabled;
    checkbox.title = "Turn this header on/off";
    checkbox.addEventListener("change", () => {
      headers[index].enabled = checkbox.checked;
      row.classList.toggle("off", !checkbox.checked);
      applyCurrent(() => {
        showStatus(`"${header.name}" turned ${checkbox.checked ? "on" : "off"}`, "success");
      });
    });

    row.appendChild(checkbox);

    if (isEditing) {
      const edit = document.createElement("div");
      edit.className = "header-row-edit";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "edit-name";
      nameInput.value = header.name;

      const valueInput = document.createElement("input");
      valueInput.type = "text";
      valueInput.className = "edit-value";
      valueInput.value = header.value;

      const handleKeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveEdit(index, nameInput, valueInput);
        } else if (event.key === "Escape") {
          editingIndex = null;
          renderList();
        }
      };
      nameInput.addEventListener("keydown", handleKeydown);
      valueInput.addEventListener("keydown", handleKeydown);

      edit.appendChild(nameInput);
      edit.appendChild(valueInput);
      row.appendChild(edit);

      const saveButton = document.createElement("button");
      saveButton.className = "row-btn save";
      saveButton.textContent = "Save";
      saveButton.addEventListener("click", () => saveEdit(index, nameInput, valueInput));

      const cancelButton = document.createElement("button");
      cancelButton.className = "row-btn cancel";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => {
        editingIndex = null;
        renderList();
      });

      row.appendChild(saveButton);
      row.appendChild(cancelButton);
      headerList.appendChild(row);

      nameInput.focus();
      nameInput.select();
    } else {
      const info = document.createElement("div");
      info.className = "header-row-info";

      const nameDiv = document.createElement("div");
      nameDiv.className = "header-row-name";
      nameDiv.textContent = header.name;

      const valueDiv = document.createElement("div");
      valueDiv.className = "header-row-value";
      valueDiv.textContent = header.value;
      valueDiv.title = header.value;

      info.appendChild(nameDiv);
      info.appendChild(valueDiv);
      row.appendChild(info);

      const editButton = document.createElement("button");
      editButton.className = "row-btn edit";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        editingIndex = index;
        renderList();
      });
      row.appendChild(editButton);

      headerList.appendChild(row);
    }
  });
}

function saveEdit(index, nameInput, valueInput) {
  const name = nameInput.value.trim();

  if (!name) {
    showStatus("Header name can't be empty", "error");
    nameInput.focus();
    return;
  }

  const isDuplicate = headers.some(
    (h, i) => i !== index && h.name.toLowerCase() === name.toLowerCase()
  );
  if (isDuplicate) {
    showStatus(`"${name}" already exists`, "error");
    return;
  }

  headers[index] = { ...headers[index], name, value: valueInput.value };
  editingIndex = null;
  renderList();
  applyCurrent(() => showStatus(`"${name}" updated`, "success"));
}

// --- Parsing / serializing ---

// Header values must be sent as strings; JSON-serialize object/array values
// so e.g. {"sellableProducts": "tep3"} becomes '{"sellableProducts":"tep3"}'
function toHeaderValue(value) {
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

// Accepts [{"name": "X", "value": "y", "enabled": true}, ...] or
// {"X-Header": "value", ...}. Empty text means no headers.
function parseHeaders(text) {
  if (!text.trim()) {
    return [];
  }

  const parsed = JSON.parse(text);

  let list;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object") {
    list = Object.entries(parsed).map(([name, value]) => ({ name, value }));
  } else {
    throw new Error("expected a JSON array or object");
  }

  const valid = list
    .filter(h => h && typeof h.name === "string" && h.name.trim() && h.value !== undefined)
    .map(h => ({
      name: h.name.trim(),
      value: toHeaderValue(h.value),
      enabled: h.enabled !== false
    }));

  if (valid.length === 0) {
    throw new Error("no valid headers found (each needs a name and value)");
  }

  return valid;
}

// Compact {"name": "value"} map when everything is on and names are unique;
// otherwise the array format, which can carry the per-header enabled flags
function serializeHeaders(list) {
  const allOn = list.every(h => h.enabled);
  const uniqueNames = new Set(list.map(h => h.name)).size === list.length;

  if (allOn && uniqueNames) {
    const map = {};
    list.forEach(h => {
      map[h.name] = h.value;
    });
    return JSON.stringify(map, null, 2);
  }

  return JSON.stringify(
    list.map(({ name, value, enabled }) => ({ name, value, enabled })),
    null,
    2
  );
}

// --- Apply ---

function currentHeaders() {
  if (viewMode === "json") {
    return parseHeaders(jsonBox.value);
  }
  return headers;
}

function headersEqual(a, b) {
  const left = normalizeHeaders(a);
  const right = normalizeHeaders(b);
  if (left.length !== right.length) {
    return false;
  }
  return left.every((header, index) => {
    const other = right[index];
    return header.name === other.name &&
      header.value === other.value &&
      header.enabled === other.enabled;
  });
}

function hasUnsavedProfileChanges() {
  if (!activeProfile || !profiles[activeProfile]) {
    return false;
  }
  try {
    return !headersEqual(currentHeaders(), profiles[activeProfile].headers);
  } catch {
    return true;
  }
}

async function saveToActiveProfile(toSave) {
  const name = profileCombo.value.trim();
  if (!name) {
    return null;
  }

  profiles[name] = { headers: toSave };
  activeProfile = name;
  await browser.storage.local.set({ profiles, activeProfile: name });
  renderProfiles();
  setProfileComboValue(name);
  return name;
}

function applyCurrent(onSuccess) {
  browser.runtime.sendMessage(
    { action: "updateRules", headers, enabled: enabledToggle.checked },
    (response) => {
      if (!response || !response.success) {
        showStatus(`Failed to apply rules: ${response?.error || "no response"}`, "error");
        return;
      }

      if (response.skipped && response.skipped.length > 0) {
        showStatus(
          `${response.applied} header(s) via network rules; ` +
          `${response.skipped.join(", ")} via in-page injection (fetch/XHR only)`,
          "success"
        );
        return;
      }

      onSuccess(response);
    }
  );
}

applyBtn.addEventListener("click", () => {
  try {
    headers = parseHeaders(jsonBox.value);
  } catch (err) {
    showStatus(`Invalid JSON: ${err.message}`, "error");
    return;
  }

  const active = headers.filter(h => h.enabled).length;
  applyCurrent(() => {
    showStatus(
      enabledToggle.checked
        ? `${active} header(s) active on all URLs`
        : `${headers.length} header(s) ready — turn the toggle on to activate`,
      "success"
    );
  });
});

enabledToggle.addEventListener("change", () => {
  const enabled = enabledToggle.checked;
  applyCurrent(() => {
    showStatus(
      enabled
        ? `Turned on — ${headers.filter(h => h.enabled).length} header(s) active`
        : "Turned off — no headers injected",
      "success"
    );
  });
});

// --- Profiles ---

function setProfileComboValue(name) {
  suppressProfileChange = true;
  profileCombo.value = name;
  suppressProfileChange = false;
}

async function loadProfile(name) {
  activeProfile = name;
  headers = normalizeHeaders(profiles[name].headers);
  jsonBox.value = serializeHeaders(headers);
  setProfileComboValue(name);
  try {
    await browser.storage.local.set({ activeProfile: name });
  } catch (err) {
    showStatus(`Profile loaded but active profile save failed: ${err.message}`, "error");
  }
  if (viewMode === "list") {
    renderList();
  }
  applyCurrent(() => {
    showStatus(`Profile "${name}" loaded and applied`, "success");
  });
}

async function trySwitchProfile(name) {
  if (suppressProfileChange || !name || name === activeProfile || !profiles[name]) {
    return;
  }

  if (hasUnsavedProfileChanges()) {
    const confirmed = confirm(
      `You have unsaved changes to profile "${activeProfile}". ` +
      `Switch to "${name}" anyway? Unsaved changes will be lost.`
    );
    if (!confirmed) {
      setProfileComboValue(activeProfile);
      return;
    }
  }

  await loadProfile(name);
}

profileCombo.addEventListener("change", () => {
  trySwitchProfile(profileCombo.value.trim());
});

profileCombo.addEventListener("blur", () => {
  trySwitchProfile(profileCombo.value.trim());
});

saveProfileBtn.addEventListener("click", async () => {
  const name = profileCombo.value.trim();
  if (!name) {
    showStatus("Enter a profile name to save", "error");
    profileCombo.focus();
    return;
  }

  let toSave;
  try {
    toSave = currentHeaders();
    headers = toSave;
  } catch (err) {
    showStatus(`Invalid JSON: ${err.message}`, "error");
    return;
  }

  try {
    await saveToActiveProfile(toSave);
    showStatus(`Profile "${name}" saved`, "success");
  } catch (err) {
    showStatus(`Profile save failed: ${err.message}`, "error");
  }
});

deleteProfileBtn.addEventListener("click", async () => {
  const name = profileCombo.value.trim();

  if (!name || !profiles[name]) {
    showStatus("Select a profile to delete", "error");
    return;
  }

  delete profiles[name];
  if (activeProfile === name) {
    activeProfile = "";
    setProfileComboValue("");
  }
  try {
    await browser.storage.local.set({ profiles, activeProfile });
  } catch (err) {
    showStatus(`Profile delete failed: ${err.message}`, "error");
    return;
  }
  renderProfiles();
  showStatus(`Profile "${name}" deleted`, "success");
});

function renderProfiles() {
  profileOptions.innerHTML = "";
  Object.keys(profiles).sort().forEach(name => {
    const opt = document.createElement("option");
    const count = profiles[name].headers.length;
    opt.value = name;
    opt.label = `${name} (${count} header${count === 1 ? "" : "s"})`;
    profileOptions.appendChild(opt);
  });
}

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  setTimeout(() => {
    statusDiv.className = "status";
  }, 3000);
}

loadState();
