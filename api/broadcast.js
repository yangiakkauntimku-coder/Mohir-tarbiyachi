// ============================================================
//  MOHIR TARBIYACHI — Bildirishnoma yuborish (Vercel Serverless Function)
//  Bu fayl /api/broadcast.js yo'lida turishi kerak.
//
//  Faqat admin panel orqali (is_admin=true bo'lgan hisobning
//  Supabase kirish tokeni bilan) chaqirilishi mumkin.
// ============================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mxrxgzrzxkvdzyfdvlhe.supabase.co";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  if (!BOT_TOKEN || !SERVICE_ROLE_KEY) {
    res.status(500).json({ ok: false, error: "server_not_configured" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const text = (body.text || "").trim();
    const accessToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (!text) { res.status(400).json({ ok: false, error: "empty_text" }); return; }
    if (!accessToken) { res.status(401).json({ ok: false, error: "no_token" }); return; }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Kim so'rov yuborayotganini va admin ekanligini tekshiramiz
    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData?.user) { res.status(401).json({ ok: false, error: "invalid_token" }); return; }

    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).single();
    if (!profile?.is_admin) { res.status(403).json({ ok: false, error: "not_admin" }); return; }

    // Barcha bot foydalanuvchilarini olamiz
    const { data: users, error: usersError } = await admin.from("bot_users").select("chat_id");
    if (usersError) { res.status(500).json({ ok: false, error: usersError.message }); return; }

    let sent = 0;
    let failed = 0;
    // Telegram cheklovi ~30 xabar/soniya — kichik partiyalarga bo'lib yuboramiz
    const chatIds = (users || []).map((u) => u.chat_id);
    const BATCH_SIZE = 20;
    for (let i = 0; i < chatIds.length; i += BATCH_SIZE) {
      const batch = chatIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (chatId) => {
          try {
            const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text }),
            });
            const data = await resp.json();
            if (data.ok) sent++; else failed++;
          } catch {
            failed++;
          }
        })
      );
      if (i + BATCH_SIZE < chatIds.length) await new Promise((r) => setTimeout(r, 1100));
    }

    res.status(200).json({ ok: true, total: chatIds.length, sent, failed });
  } catch (err) {
    console.error("broadcast xatoligi:", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
}
