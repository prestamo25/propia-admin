import { redirect } from "next/navigation";

// The Zonas bench moved into the big map (fase 2, 2026-09-23): every zone of
// the estado, editing, and the «Sin resolver» queue now live on /mapa.
// Kept as a redirect so old links and bookmarks land somewhere useful.
export default function ZonasPage() {
  redirect("/mapa");
}
