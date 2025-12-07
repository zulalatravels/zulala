// src/whatsapp.js

const BACKEND_URL = "http://localhost:4000";

export async function sendWhatsAppMessage(toNumber, text) {
  // Ensure in international format without +
  const cleaned = toNumber.replace(/[^0-9]/g, "");

  try {
    const res = await fetch(`${BACKEND_URL}/api/whatsapp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: cleaned, text }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.error("WA send failed:", data);
      return false;
    }
    return true;
  } catch (err) {
    console.error("WA network error:", err);
    return false;
  }
}
