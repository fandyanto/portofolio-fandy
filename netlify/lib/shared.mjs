import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

// ---------- Autentikasi ----------
// Password dibandingkan dengan timing-safe, lalu sesi disimpan sebagai cookie
// bertanda tangan HMAC. Butuh env ADMIN_PASSWORD dan SESSION_SECRET.

export function passwordOk(input) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || typeof input !== "string") return false;
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET belum diatur");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function makeSession() {
  const payload = String(Date.now() + 12 * 60 * 60 * 1000);
  return `${payload}.${sign(payload)}`;
}

export function isValidSession(cookieHeader) {
  if (!process.env.SESSION_SECRET) return false;
  const m = /(?:^|;\s*)admin_session=([^;]+)/.exec(cookieHeader || "");
  if (!m) return false;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const sigOk = sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return sigOk && Date.now() < Number(payload);
}

export function sessionCookie(value, maxAge) {
  return `admin_session=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// ---------- Penyimpanan ----------
// Daftar tulisan disimpan di Netlify Blobs (key "posts").
// Jika belum ada, diisi sekali dari /data/posts.json di situs.

export async function loadPosts(origin) {
  const store = getStore("blog");
  const existing = await store.get("posts", { type: "json" });
  if (Array.isArray(existing)) return existing;

  try {
    const res = await fetch(new URL("/data/posts.json", origin));
    if (res.ok) {
      const seed = await res.json();
      if (Array.isArray(seed)) {
        await store.setJSON("posts", seed);
        return seed;
      }
    }
  } catch (e) {
    console.warn("Gagal mengisi data awal:", e);
  }
  return [];
}

// ---------- Validasi ----------

const IMG_RE = /^(\/api\/media\/[A-Za-z0-9._-]+|img\/[A-Za-z0-9_\-/]+\.(jpe?g|png|webp))$/i;

function okImg(p) {
  return typeof p === "string" && IMG_RE.test(p) && !p.includes("..");
}

const BLOCK_TYPES = ["p", "h2", "ul", "quote", "img"];

export function cleanPost(p) {
  if (!p || typeof p !== "object") throw new HttpError(400, "Data tulisan tidak valid");

  const s = (k, max) => String(p[k] ?? "").trim().slice(0, max);
  const title = s("title", 200);
  const slug = s("slug", 120);
  const date = s("date", 10);
  const category = s("category", 60);
  const excerpt = s("excerpt", 400);
  const cover = s("cover", 200);

  if (!title) throw new HttpError(400, "Judul wajib diisi");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    throw new HttpError(400, "Slug hanya boleh huruf kecil, angka, dan tanda hubung");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")))
    throw new HttpError(400, "Tanggal tidak valid");
  if (cover && !okImg(cover)) throw new HttpError(400, "Path sampul tidak valid");

  const body = [];
  for (const b of Array.isArray(p.body) ? p.body : []) {
    if (!b || typeof b !== "object") continue;
    const type = b.type;
    if (!BLOCK_TYPES.includes(type)) throw new HttpError(400, "Jenis blok tidak dikenal");

    if (type === "ul") {
      const items = (Array.isArray(b.items) ? b.items : [])
        .map((x) => String(x).trim().slice(0, 500))
        .filter(Boolean);
      body.push({ type, items });
    } else if (type === "img") {
      const src = String(b.src || "").trim();
      if (!okImg(src)) throw new HttpError(400, "Ada blok gambar yang belum dipilih fotonya");
      const item = { type, src, alt: String(b.alt || "").trim().slice(0, 200) };
      const caption = String(b.caption || "").trim().slice(0, 300);
      if (caption) item.caption = caption;
      body.push(item);
    } else {
      const text = String(b.text || "").trim();
      if (!text) continue;
      body.push({ type, text: text.slice(0, 5000) });
    }
  }

  const out = { slug, title, date };
  if (category) out.category = category;
  if (excerpt) out.excerpt = excerpt;
  if (cover) out.cover = cover;
  if (p.draft) out.draft = true;
  out.body = body;
  return out;
}
