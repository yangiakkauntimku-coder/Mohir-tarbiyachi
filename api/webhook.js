// ============================================================
//  MOHIR TARBIYACHI — Telegram bot webhook (Vercel Serverless Function)
//  Bu fayl loyihangizda /api/webhook.js yo'lida turishi kerak.
//
//  Pastki menyuda 3 ta tugma bo'ladi:
//   🎓 Test ishlash        -> saytni Mini App sifatida ochadi
//   🔥 VIP obuna            -> obuna haqida matn bilan javob beradi
//   ℹ️ Ma'lumot va yordam   -> platforma haqida qisqa ma'lumot beradi
// ============================================================

import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://mohirtarbiyachi.vercel.app"; // <-- saytingiz Vercel domenini shu yerga yozing
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const SUPABASE_URL = "https://mxrxgzrzxkvdzyfdvlhe.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

async function rememberBotUser(message) {
  if (!admin) return; // SUPABASE_SERVICE_ROLE_KEY sozlanmagan bo'lsa, jim o'tkazib yuboramiz
  try {
    await admin.from("bot_users").upsert({
      chat_id: message.chat.id,
      telegram_id: message.from?.id,
      username: message.from?.username || null,
      first_name: message.from?.first_name || null,
    });
  } catch (err) {
    console.error("bot_users saqlashda xatolik:", err);
  }
}

// -------- O'ZGARTIRISHINGIZ MUMKIN BO'LGAN MATNLAR --------
const ADMIN_CONTACT = "@AzadiB_way"; // <-- shu yerga o'z Telegram username'ingizni yozing

const VIP_TEXT =
  `🔥 VIP obuna\n\n` +
  `VIP obuna orqali barcha yopiq (VIP) testlarga kirish imkoniyati ochiladi.\n\n` +
  `Obuna olish uchun administrator bilan bog'laning: ${ADMIN_CONTACT}\n` +
  `To'lov qilinganidan so'ng, admin sizning hisobingizni panel orqali VIP qilib beradi.`;

const INFO_TEXT =
  `ℹ️ Mohir Tarbiyachi haqida\n\n` +
  `Bu platforma attestatsiyaga tayyorlanayotgan tarbiyachilar uchun mo'ljallangan.\n\n` +
  `📝 Testlar rasmiy attestatsiya formatida (belgilangan vaqt ichida)\n` +
  `📊 Har bir test yakunida natijangizni darhol ko'rasiz\n` +
  `🏆 Umumiy reytingda o'z o'rningizni kuzatib borasiz\n` +
  `⭐ Ba'zi testlar VIP obunachilar uchun\n\n` +
  `Savollar bo'lsa: ${ADMIN_CONTACT}`;
// ------------------------------------------------------------

const MAIN_MENU = {
  keyboard: [
    [{ text: "🎓 Test ishlash", web_app: { url: SITE_URL } }],
    [{ text: "🔥 VIP obuna" }, { text: "ℹ️ Ma'lumot va yordam" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

async function sendMessage(chatId, text, extra = {}) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: MAIN_MENU,
      ...extra,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error("Telegram sendMessage xatoligi:", resp.status, body);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("Mohir Tarbiyachi bot webhook ishlayapti.");
    return;
  }
  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN muhit o'zgaruvchisi topilmadi.");
    res.status(200).send("OK");
    return;
  }

  try {
    const update = req.body;
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = (message?.text || "").trim();

    if (chatId) {
      const firstName = message?.from?.first_name || "";
      await rememberBotUser(message);

      if (text.startsWith("/start")) {
        await sendMessage(
          chatId,
          `Assalomu alaykum${firstName ? ", " + firstName : ""}! 👋\n\n` +
            `Mohir Tarbiyachi — attestatsiyaga tayyorlanayotgan tarbiyachilar uchun test platformasi.\n\n` +
            `Pastdagi menyudan foydalaning 👇`
        );
      } else if (text.includes("VIP")) {
        await sendMessage(chatId, VIP_TEXT);
      } else if (text.includes("Ma'lumot") || text.includes("Malumot") || text.includes("yordam")) {
        await sendMessage(chatId, INFO_TEXT);
      } else {
        // Boshqa har qanday matnga ham menyuni qayta ko'rsatamiz
        await sendMessage(chatId, "Pastdagi menyudan foydalaning 👇");
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook xatoligi:", err);
    res.status(200).send("OK");
  }
}
