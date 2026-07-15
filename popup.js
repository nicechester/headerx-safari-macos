const jsonBox = document.getElementById("jsonBox");
const headerList = document.getElementById("headerList");
const viewJsonBtn = document.getElementById("viewJsonBtn");
const viewListBtn = document.getElementById("viewListBtn");
const saveBtn = document.getElementById("saveBtn");
const enabledToggle = document.getElementById("enabledToggle");
const statusDiv = document.getElementById("status");
const profileSelect = document.getElementById("profileSelect");
const profileNameInput = document.getElementById("profileName");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const loadProfileBtn = document.getElementById("loadProfileBtn");
const deleteProfileBtn = document.getElementById("deleteProfileBtn");

let headers = [];   // [{ name, value, enabled }]
let profiles = {};
let viewMode = "json";
let editingIndex = null;

async function loadState() {
  const state = await browser.storage.local.get(["headers", "enabled", "profiles", "viewMode"]);
  headers = normalizeHeaders(state.headers || []);
  profiles = state.profiles || {};
  enabledToggle.checked = state.enabled || false;
  jsonBox.value = headers.length > 0 ? serializeHeaders(headers) : "";
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
  saveBtn.style.display = mode === "json" ? "" : "none";
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

function applyCurrent(onSuccess) {
  browser.runtime.sendMessage(
    { action: "updateRules", headers, enabled: enabledToggle.checked },
    (response) => {
      if (response && response.success) {
        if (response.skipped && response.skipped.length > 0) {
          showStatus(
            `${response.applied} header(s) via network rules; ` +
            `${response.skipped.join(", ")} via in-page injection (fetch/XHR only)`,
            "success"
          );
        } else {
          onSuccess(response);
        }
      } else {
        showStatus(`Failed to apply rules: ${response?.error || "no response"}`, "error");
      }
    }
  );
}

saveBtn.addEventListener("click", () => {
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
        ? `Saved — ${active} header(s) active on all URLs`
        : `Saved ${headers.length} header(s) — turn the toggle on to activate`,
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

function currentHeaders() {
  if (viewMode === "json") {
    return parseHeaders(jsonBox.value); // may throw
  }
  return headers;
}

saveProfileBtn.addEventListener("click", async () => {
  const name = profileNameInput.value.trim() || profileSelect.value;

  if (!name) {
    showStatus("Enter a profile name (or select one to overwrite)", "error");
    return;
  }

  let toSave;
  try {
    toSave = currentHeaders();
  } catch (err) {
    showStatus(`Invalid JSON: ${err.message}`, "error");
    return;
  }

  profiles[name] = { headers: toSave };
  await chrome.storage.local.set({ profiles });
  profileNameInput.value = "";
  renderProfiles();
  profileSelect.value = name;
  showStatus(`Profile "${name}" saved`, "success");
});

loadProfileBtn.addEventListener("click", () => {
  const name = profileSelect.value;

  if (!name || !profiles[name]) {
    showStatus("Select a profile to load", "error");
    return;
  }

  headers = normalizeHeaders(profiles[name].headers);
  jsonBox.value = serializeHeaders(headers);
  if (viewMode === "list") {
    renderList();
    applyCurrent(() => {
      showStatus(`Profile "${name}" loaded and applied`, "success");
    });
  } else {
    showStatus(`Profile "${name}" loaded — click Save & Apply to activate`, "success");
  }
});

deleteProfileBtn.addEventListener("click", async () => {
  const name = profileSelect.value;

  if (!name || !profiles[name]) {
    showStatus("Select a profile to delete", "error");
    return;
  }

  delete profiles[name];
  await chrome.storage.local.set({ profiles });
  renderProfiles();
  showStatus(`Profile "${name}" deleted`, "success");
});

function renderProfiles() {
  profileSelect.innerHTML = '<option value="">— saved profiles —</option>';
  Object.keys(profiles).sort().forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    const count = profiles[name].headers.length;
    opt.textContent = `${name} (${count} header${count === 1 ? "" : "s"})`;
    profileSelect.appendChild(opt);
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
