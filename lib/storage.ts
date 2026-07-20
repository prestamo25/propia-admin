import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// R2 is S3-compatible. Photos are stored under a top-level prefix per owner:
//   <uid>/…   → a broker's property/event photos (see delete-account sweep)
//   wa/<id>/… → the WhatsApp bot's captured photos
// We list the bucket and total bytes by that first path segment.

function r2(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SPECIAL: Record<string, string> = {
  wa: "WhatsApp bot",
  avatars: "Avatares",
  events: "Eventos",
};

export type StorageRow = {
  prefix: string;
  label: string;
  bytes: number;
  objects: number;
  isBroker: boolean;
  brokerId: string | null;
};

export type StorageData = {
  rows: StorageRow[];
  totals: { bytes: number; objects: number; folders: number; brokers: number };
};

export function humanBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// The full-bucket scan costs seconds and grows with every photo; totals don't
// need per-second freshness, so memoize per server instance for 5 minutes.
const STORAGE_TTL_MS = 5 * 60 * 1000;
let storageCache: { data: StorageData; at: number } | null = null;

export async function fetchStorage(): Promise<StorageData> {
  if (storageCache && Date.now() - storageCache.at < STORAGE_TTL_MS) {
    return storageCache.data;
  }
  const data = await scanStorage();
  storageCache = { data, at: Date.now() };
  return data;
}

async function scanStorage(): Promise<StorageData> {
  const client = r2();
  const bucket = process.env.R2_BUCKET || "propia-photos";

  const bySeg = new Map<string, { bytes: number; objects: number }>();
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      const seg = (o.Key ?? "").split("/")[0] || "(root)";
      const e = bySeg.get(seg) ?? { bytes: 0, objects: 0 };
      e.bytes += o.Size ?? 0;
      e.objects += 1;
      bySeg.set(seg, e);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  // resolve broker names for uid-shaped prefixes
  const segs = [...bySeg.keys()];
  const uidSegs = segs.filter((s) => UID_RE.test(s));
  const usersRes = uidSegs.length
    ? await supabaseAdmin()
        .from("users")
        .select("id, name, first_name, last_name")
        .in("id", uidSegs)
    : { data: [] as { id: string; name: string | null; first_name: string | null; last_name: string | null }[] };
  const nameOf = new Map(
    (usersRes.data ?? []).map((u) => [
      u.id,
      [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.name || null,
    ]),
  );

  const rows: StorageRow[] = segs
    .map((seg) => {
      const e = bySeg.get(seg)!;
      const isBroker = UID_RE.test(seg);
      const label = isBroker
        ? (nameOf.get(seg) ?? "Broker desconocido")
        : (SPECIAL[seg] ?? seg);
      return {
        prefix: seg,
        label,
        bytes: e.bytes,
        objects: e.objects,
        isBroker,
        brokerId: isBroker ? seg : null,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);

  return {
    rows,
    totals: {
      bytes: rows.reduce((s, r) => s + r.bytes, 0),
      objects: rows.reduce((s, r) => s + r.objects, 0),
      folders: rows.length,
      brokers: rows.filter((r) => r.isBroker).length,
    },
  };
}
