const key = "__nivasaos_extensions__";

function createRegistry() {
  return {
    paymentMethods: new Map(),
    notificationDrivers: new Map(),
    dashboardSections: [],
    settingsSections: []
  };
}

export const extensions = globalThis[key] || createRegistry();
if (!globalThis[key]) globalThis[key] = extensions;

export function registerPaymentMethod(method) {
  if (!method?.id || !method?.label) throw new Error("Payment method requires id and label");
  extensions.paymentMethods.set(method.id, method);
}

export function registerNotificationDriver(driver) {
  if (!driver?.id || !driver?.prepare) throw new Error("Notification driver requires id and prepare()");
  extensions.notificationDrivers.set(driver.id, driver);
}

export function registerDashboardSection(section) {
  if (!section?.id || typeof section.render !== "function") throw new Error("Dashboard section requires id and render");
  const index = extensions.dashboardSections.findIndex(item => item.id === section.id);
  if (index >= 0) extensions.dashboardSections[index] = section;
  else extensions.dashboardSections.push(section);
}

export function registerSettingsSection(section) {
  if (!section?.id || typeof section.render !== "function") throw new Error("Settings section requires id and render");
  const index = extensions.settingsSections.findIndex(item => item.id === section.id);
  if (index >= 0) extensions.settingsSections[index] = section;
  else extensions.settingsSections.push(section);
}

registerPaymentMethod({ id: "cash", label: "Cash" });
registerPaymentMethod({ id: "bank_transfer", label: "Bank transfer" });
registerPaymentMethod({ id: "upi", label: "UPI" });
registerPaymentMethod({ id: "card", label: "Card / POS" });
registerPaymentMethod({ id: "other", label: "Other" });

registerNotificationDriver({
  id: "whatsapp_link",
  label: "WhatsApp click-to-chat",
  prepare({ recipient, message }) {
    const phone = String(recipient || "").replace(/[^0-9]/g, "");
    return {
      status: "prepared",
      url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    };
  }
});
