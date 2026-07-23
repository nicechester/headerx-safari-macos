const INACTIVE_ICONS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png"
};

const ACTIVE_ICONS = {
  16: "icons/icon-active-16.png",
  32: "icons/icon-active-32.png",
  48: "icons/icon-active-48.png"
};

const BADGE_ACTIVE_COLOR = "#22c55e";

function countActiveHeaders(headers, enabled) {
  if (!enabled) {
    return 0;
  }
  return (headers || []).filter(h => h.enabled !== false).length;
}

async function updateToolbarIndicator(headers, enabled) {
  const activeCount = countActiveHeaders(headers, enabled);

  if (!enabled) {
    await browser.action.setIcon({ path: INACTIVE_ICONS });
    await browser.action.setBadgeText({ text: "" });
    await browser.action.setTitle({ title: "HeaderX — off" });
    return;
  }

  await browser.action.setIcon({ path: ACTIVE_ICONS });
  await browser.action.setBadgeBackgroundColor({ color: BADGE_ACTIVE_COLOR });
  await browser.action.setBadgeText({
    text: activeCount > 0 ? String(activeCount) : ""
  });
  await browser.action.setTitle({
    title: activeCount > 0
      ? `HeaderX — ${activeCount} header${activeCount === 1 ? "" : "s"} active`
      : "HeaderX — on (no headers)"
  });
}

function buildRule(id, header) {
  return {
    id,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: header.name.trim().toLowerCase(), operation: "set", value: header.value }
      ]
    },
    condition: {
      // FIX: Completely omitted urlFilter: "*" to make it a valid global match in Safari
      resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "ping"]
    }
  };
}

async function applyRules(headers, enabled) {
  const existingRules = await browser.declarativeNetRequest.getDynamicRules();
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRules.map(rule => rule.id)
  });

  const active = enabled ? (headers || []).filter(h => h.enabled !== false) : [];
  const rulesToAdd = [];
  const skipped = [];

  let id = 1;
  for (const header of active) {
    rulesToAdd.push(buildRule(id, header));
    id++;
  }

  let applied = 0;
  if (rulesToAdd.length > 0) {
    try {
      // FIX: Batch the updates together to minimize runtime friction
      await browser.declarativeNetRequest.updateDynamicRules({
        addRules: rulesToAdd
      });
      applied = rulesToAdd.length;
    } catch (err) {
      console.warn("DNR Batch failed, dropping back to validated separation:", err.message);
      // Fail-safe sequential optimization loop
      id = 1;
      for (const header of active) {
        try {
          await browser.declarativeNetRequest.updateDynamicRules({
            addRules: [buildRule(id, header)]
          });
          id++;
          applied++;
        } catch (singleErr) {
          console.warn(`Header "${header.name}" rejected by Safari DNR:`, singleErr.message);
          skipped.push(header.name);
        }
      }
    }
  }

  console.log(
    enabled
      ? `HeaderX on: ${applied} header(s) via network rules` +
        (skipped.length ? `, ${skipped.length} via page script: ${skipped.join(", ")}` : "")
      : "HeaderX off: no headers injected"
  );

  await updateToolbarIndicator(headers, enabled);
  return { applied, skipped };
}

async function restoreToolbarIndicator() {
  const { headers = [], enabled = false } = await browser.storage.local.get([
    "headers",
    "enabled"
  ]);
  await updateToolbarIndicator(headers, enabled);
}

if (browser.runtime.onStartup) {
  browser.runtime.onStartup.addListener(() => {
    restoreToolbarIndicator().catch(err => {
      console.error("HeaderX indicator restore failed:", err);
    });
  });
}

restoreToolbarIndicator().catch(err => {
  console.error("HeaderX indicator restore failed:", err);
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || (!changes.headers && !changes.enabled)) {
    return;
  }

  const { headers = [], enabled = false } = await browser.storage.local.get([
    "headers",
    "enabled"
  ]);
  await updateToolbarIndicator(headers, enabled);
});

browser.runtime.onInstalled.addListener(async () => {
  const { headers = [], enabled = false } = await browser.storage.local.get([
    "headers",
    "enabled"
  ]);
  await applyRules(headers, enabled);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateRules") {
    (async () => {
      let storageError = null;
      try {
        await browser.storage.local.set({
          headers: message.headers,
          enabled: message.enabled
        });
      } catch (error) {
        storageError = error;
        console.error("HeaderX Safari storage error:", error);
      }

      try {
        const result = await applyRules(message.headers, message.enabled);
        if (storageError) {
          sendResponse({
            success: false,
            error: storageError.message,
            ...result
          });
          return;
        }
        sendResponse({ success: true, ...result });
      } catch (error) {
        console.error("HeaderX Safari Sync Error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});
