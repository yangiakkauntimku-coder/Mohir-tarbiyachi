// ============================================================
//  MOHIR TARBIYACHI — Telegramdan avtomatik kirish
//  Bu fayl /api/telegram-auth.js yo'lida turishi kerak.
//
//  Nima qiladi:
//   1) Telegram Mini App yuborgan initData'ni tekshiradi (soxta bo'lmasligiga ishonch)
//   2) Foydalanuvchi CHANNEL_USERNAME kanaliga a'zo ekanligini tekshiradi
//   3) A'zo bo'lsa — Supabase'da hisobini avtomatik yaratadi/topadi va
//      frontendga vaqtinchalik email+parol qaytaradi (shu bilan darhol kirish uchun)
//
//  KERAKLI MUHIT O'ZGARUVCHILARI (Vercel -> Settings -> Environment Variables):
//   - TELEGRAM_BOT_TOKEN        (bot tokeningiz, webhook.js bilan bir xil)
//   - SUPABASE_SERVICE_ROLE_KEY (Supabase -> Settings -> API -> service_role, MAXFIY!)
//   - TELEGRAM_LOGIN_SECRET     (o'zingiz o'ylab topgan uzun tasodifiy matn, 40-50 belgi)
// ============================================================

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mxrxgzrzxkvdzyfdvlhe.supabase.co";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOGIN_SECRET = process.env.TELEGRAM_LOGIN_SECRET;

// <-- O'zingizning kanalingiz username'ini shu yerga yozing (@ bilan)
const CHANNEL_USERNAME = "@mohirtarbiyachi";

// Email domeni Supabase har doim qabul qiladigan, haqiqiy ko'rinishdagi domen bo'lishi kerak
const EMAIL_DOMAIN = "mohirtarbiyachi.uz";

function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computedHash !== hash) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (Date.now() / 1000 - authDate > 86400) return null; // 24 soatdan eski bo'lsa rad etamiz

  const userJson = params.get("user");
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

function derivePassword(telegramId) {
  return crypto.createHmac("sha256", LOGIN_SECRET).update(String(telegramId)).digest("hex").slice(0, 32);
}

async function isChannelMember(userId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(CHANNEL_USERNAME)}&user_id=${userId}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!data.ok) return false;
  const status = data.result?.status;
  return ["member", "administrator", "creator"].includes(status);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  if (!BOT_TOKEN || !SERVICE_ROLE_KEY || !LOGIN_SECRET) {
    console.error("Muhit o'zgaruvchilari to'liq emas: TELEGRAM_BOT_TOKEN / SUPABASE_SERVICE_ROLE_KEY / TELEGRAM_LOGIN_SECRET");
    res.status(500).json({ ok: false, error: "server_not_configured" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const tgUser = verifyInitData(body.initData);
    if (!tgUser) {
      res.status(401).json({ ok: false, error: "invalid_init_data" });
      return;
    }

    const subscribed = await isChannelMember(tgUser.id);
    if (!subscribed) {
      res.status(200).json({ ok: false, reason: "not_subscribed", channel: CHANNEL_USERNAME });
      return;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const email = `tg${tgUser.id}@${EMAIL_DOMAIN}`;
    const password = derivePassword(tgUser.id);
    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Tarbiyachi";

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    let userId = created?.user?.id;
    if (createError) {
      const alreadyExists = /already|exists|registered/i.test(createError.message || "");
      if (alreadyExists) {
        const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listError) {
          res.status(500).json({ ok: false, error: listError.message });
          return;
        }
        const existing = list?.users?.find((u) => u.email === email);
        userId = existing?.id;
      } else {
        res.status(500).json({ ok: false, error: createError.message });
        return;
      }
    }

    if (userId) {
      await admin.from("profiles").upsert({ id: userId, full_name: fullName, telegram_id: String(tgUser.id) });
    }

    res.status(200).json({ ok: true, email, password });
  } catch (err) {
    console.error("telegram-auth xatoligi:", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
}
