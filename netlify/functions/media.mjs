import { getStore } from "@netlify/blobs";

// Endpoint publik: mengirim gambar yang diunggah lewat panel admin.
export default async (req) => {
  const name = decodeURIComponent(new URL(req.url).pathname.split("/").pop() || "");
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  const blob = await getStore("media").getWithMetadata(name, { type: "arrayBuffer" });
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(blob.data, {
    headers: {
      "Content-Type": blob.metadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};

export const config = { path: "/api/media/*" };
