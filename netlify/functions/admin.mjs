import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import {
  json, HttpError, passwordOk, makeSession, isValidSession,
  sessionCookie, cleanPost, loadPosts,
} from "../lib/shared.mjs";

const MAX_BYTES = 3 * 1024 * 1024; // batas aman untuk body function (6 MB)
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Memastikan isi file benar-benar gambar, bukan file lain yang diberi nama .jpg
function looksLike(buf, ext) {
  if (ext === "jpg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (ext === "png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === "webp") return buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
  return false;
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin/, "").replace(/\/+$/, "") || "/";

  try {
    // Login tidak butuh sesi
    if (route === "/login" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!passwordOk(body.password)) {
        await new Promise((r) => setTimeout(r, 800)); // perlambat tebak password
        throw new HttpError(401, "Password salah");
      }
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(makeSession(), 60 * 60 * 12) });
    }

    // Semua rute lain wajib sesi valid
    if (!isValidSession(req.headers.get("cookie"))) throw new HttpError(401, "Belum login");

    // Perlindungan CSRF: header kustom tidak bisa dikirim lintas situs tanpa preflight
    if (req.method !== "GET" && req.headers.get("x-requested-with") !== "admin") {
      throw new HttpError(403, "Permintaan tidak valid");
    }

    if (route === "/logout" && req.method === "POST") {
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (route === "/session" && req.method === "GET") return json({ ok: true });

    if (route === "/posts" && req.method === "GET") {
      return json({ posts: await loadPosts(url.origin) });
    }

    if (route === "/posts" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const post = cleanPost(body.post);
      const original = body.original_slug || null;
      const posts = await loadPosts(url.origin);

      if (posts.some((p) => p.slug === post.slug && p.slug !== original)) {
        throw new HttpError(409, "Slug sudah dipakai tulisan lain");
      }
      const i = original ? posts.findIndex((p) => p.slug === original) : -1;
      if (i >= 0) posts[i] = post;
      else posts.push(post);

      await getStore("blog").setJSON("posts", posts);
      return json({ ok: true, slug: post.slug });
    }

    if (route === "/posts/delete" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const slug = String(body.slug || "");
      if (!slug) throw new HttpError(400, "Slug kosong");
      const posts = (await loadPosts(url.origin)).filter((p) => p.slug !== slug);
      await getStore("blog").setJSON("posts", posts);
      return json({ ok: true });
    }

    if (route === "/upload" && req.method === "POST") {
      const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const ext = TYPES[type];
      if (!ext) throw new HttpError(415, "Hanya JPG, PNG, atau WEBP");

      const data = await req.arrayBuffer();
      if (data.byteLength > MAX_BYTES) throw new HttpError(413, "Ukuran maksimal 3 MB");
      if (!looksLike(Buffer.from(data), ext)) throw new HttpError(415, "File bukan gambar yang valid");

      const name = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
      await getStore("media").set(name, data, { metadata: { contentType: type } });
      return json({ path: `/api/media/${name}` });
    }

    throw new HttpError(404, "Aksi tidak dikenal");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Terjadi kesalahan di server" }, 500);
  }
};

export const config = { path: "/api/admin/*" };
