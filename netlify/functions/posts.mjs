import { json, loadPosts } from "../lib/shared.mjs";

// Endpoint publik: daftar tulisan yang sudah terbit (tanpa draft).
export default async (req) => {
  const posts = (await loadPosts(new URL(req.url).origin))
    .filter((p) => !p.draft)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return json(posts, 200, { "Cache-Control": "public, max-age=60" });
};

export const config = { path: "/api/posts" };
