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
  return { applied, skipped };
}

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
      try {
        await browser.storage.local.set({
          headers: message.headers,
          enabled: message.enabled
        });
        const result = await applyRules(message.headers, message.enabled);
        sendResponse({ success: true, ...result });
      } catch (error) {
        console.error("HeaderX Safari Sync Error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});