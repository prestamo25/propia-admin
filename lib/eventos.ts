import { supabaseAdmin } from "./supabaseAdmin";
import { pageAll } from "./pageAll";

// Eventos (Franz 2026-09-02): every event in the network — private ones too,
// every state — with its registrations, and per event the participant list
// with who was scanned, when, and by whom. Read-only. The panel reads with
// the service key, so visibility and RLS never hide anything here.

export type AttendeeStatus = "attended" | "confirmed" | "pending" | "waitlist" | "invited" | "declined";

export const STATUS_ORDER: AttendeeStatus[] = ["attended", "confirmed", "pending", "waitlist", "invited", "declined"];

export const ATTENDEE_STATUS_LABEL: Record<string, string> = {
  attended: "Asistió",
  confirmed: "Confirmado",
  pending: "Pago pendiente",
  waitlist: "Lista de espera",
  invited: "Invitado",
  declined: "Declinó",
};

// Mirrors the app's EVENT_TYPE_LABELS (src/lib/events.ts). Keep in sync.
export const EVENT_TYPE_LABEL: Record<string, string> = {
  open_house: "Open House",
  course: "Curso",
  capacitacion: "Capacitación",
  networking: "Networking",
  certification: "Certificación",
  foro: "Foro",
  diplomado: "Diplomado",
  congreso: "Congreso",
};

export const MODALITY_LABEL: Record<string, string> = {
  in_person: "Presencial",
  presencial: "Presencial",
  online: "En línea",
  hybrid: "Híbrido",
};

export type EventCounts = {
  invited: number;
  confirmed: number;
  attended: number;
  pending: number;
  waitlist: number;
  declined: number;
  registered: number; // confirmed + attended — the people who actually had a seat
};

export type Organizer = { id: string; name: string | null; company: string | null };

export type EventRow = {
  id: string;
  title: string;
  type: string;
  modality: string;
  state: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  visibility: string;
  is_paid: boolean;
  price: number | null;
  capacity: number | null;
  commission: number | null;
  approval_mode: string;
  image_url: string | null;
  created_at: string;
  organizer: Organizer | null;
  counts: EventCounts;
};

type RawEvent = Omit<EventRow, "organizer" | "counts"> & {
  organizer: Organizer | Organizer[] | null;
  attendees: { status: string }[] | null;
};

const EVENT_COLS =
  "id, title, type, modality, state, location, start_at, end_at, visibility, is_paid, price, capacity, commission, approval_mode, image_url, created_at";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function countStatuses(rows: { status: string }[]): EventCounts {
  const c: EventCounts = { invited: 0, confirmed: 0, attended: 0, pending: 0, waitlist: 0, declined: 0, registered: 0 };
  for (const r of rows) {
    if (r.status in c) c[r.status as AttendeeStatus]++;
  }
  c.registered = c.confirmed + c.attended;
  return c;
}

export async function fetchEvents(): Promise<EventRow[]> {
  const sb = supabaseAdmin();
  const rows = await pageAll<RawEvent>(() =>
    sb
      .from("events")
      .select(`${EVENT_COLS}, organizer:users!events_created_by_fkey(id, name, company), attendees:event_attendees(status)`)
      .order("start_at", { ascending: false }),
  );
  return rows.map((r) => ({
    ...r,
    organizer: one(r.organizer),
    counts: countStatuses(r.attendees ?? []),
  }));
}

export type Participant = {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  avatar_url: string | null;
  profile_type: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null; // name, resolved
  receipt_url: string | null;
  receipt_uploaded_at: string | null;
  approved_by: string | null; // name, resolved
  invited_by: string | null; // name, resolved
};

export type StaffMember = { id: string; name: string | null; phone: string | null };

export type EventDetail = EventRow & {
  description: string | null;
  organiser: string | null;
  phone: string | null;
  whatsapp_group_url: string | null;
  maps_url: string | null;
  payment_url: string | null;
  staff: StaffMember[];
  share_links: number;
  participants: Participant[];
};

type RawAttendee = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  responded_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  receipt_url: string | null;
  receipt_uploaded_at: string | null;
  approved_by: string | null;
  invited_by: string | null;
  user: { id: string; name: string | null; phone: string | null; company: string | null; avatar_url: string | null; profile_type: string | null } | null;
};

export async function fetchEventDetail(id: string): Promise<EventDetail | null> {
  const sb = supabaseAdmin();
  const { data: ev, error } = await sb
    .from("events")
    .select(
      `${EVENT_COLS}, description, organiser, phone, whatsapp_group_url, maps_url, payment_url, organizer:users!events_created_by_fkey(id, name, company)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!ev) return null;

  const [attendees, staffRows, shareRows] = await Promise.all([
    pageAll<RawAttendee>(() =>
      sb
        .from("event_attendees")
        .select(
          "id, user_id, status, created_at, responded_at, checked_in_at, checked_in_by, receipt_url, receipt_uploaded_at, approved_by, invited_by, user:users!event_attendees_user_id_fkey(id, name, phone, company, avatar_url, profile_type)",
        )
        .eq("event_id", id)
        .order("created_at", { ascending: true }),
    ),
    sb.from("event_staff").select("user:users!event_staff_user_id_fkey(id, name, phone)").eq("event_id", id),
    sb.from("event_share_links").select("id").eq("event_id", id),
  ]);

  // The trail columns hold user ids; one lookup turns them into names.
  const actorIds = new Set<string>();
  for (const a of attendees) {
    for (const k of [a.checked_in_by, a.approved_by, a.invited_by]) if (k) actorIds.add(k);
  }
  const names = new Map<string, string>();
  if (actorIds.size) {
    const { data } = await sb.from("users").select("id, name").in("id", [...actorIds]);
    for (const u of data ?? []) names.set(u.id, u.name ?? "—");
  }
  const actor = (uid: string | null) => (uid ? (names.get(uid) ?? "—") : null);

  const participants: Participant[] = attendees.map((a) => {
    const u = one(a.user);
    return {
      id: a.id,
      user_id: a.user_id,
      name: u?.name ?? null,
      phone: u?.phone ?? null,
      company: u?.company ?? null,
      avatar_url: u?.avatar_url ?? null,
      profile_type: u?.profile_type ?? null,
      status: a.status,
      created_at: a.created_at,
      responded_at: a.responded_at,
      checked_in_at: a.checked_in_at,
      checked_in_by: actor(a.checked_in_by),
      receipt_url: a.receipt_url,
      receipt_uploaded_at: a.receipt_uploaded_at,
      approved_by: actor(a.approved_by),
      invited_by: actor(a.invited_by),
    };
  });

  const staff: StaffMember[] = ((staffRows.data ?? []) as { user: StaffMember | StaffMember[] | null }[])
    .map((s) => one(s.user))
    .filter((s): s is StaffMember => s != null);

  const { organizer, ...rest } = ev as unknown as Omit<EventDetail, "staff" | "share_links" | "participants" | "counts" | "organizer"> & {
    organizer: Organizer | Organizer[] | null;
  };
  return {
    ...rest,
    organizer: one(organizer),
    counts: countStatuses(participants),
    staff,
    share_links: (shareRows.data ?? []).length,
    participants,
  };
}

// --- formatting shared by the pages and the export ---------------------------

const TZ = "America/Mexico_City";

export function fmtWhen(start: string, end: string | null): string {
  const s = new Date(start);
  // 24-hour clock, like the app's own event cards («17:45–20:00»): shorter
  // than «4:00 p.m.–5:00 p.m.» and it keeps the table's numbers on a laptop.
  const day = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(s);
  const time = (d: Date) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return end ? `${day} · ${time(s)}–${time(new Date(end))}` : `${day} · ${time(s)}`;
}

export function fmtStamp(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

export function fmtPhone(raw: string | null): string {
  if (!raw) return "";
  // users.phone is bare digits; events.phone was typed by the organizer and
  // sometimes carries its own "+" or spaces.
  const p = raw.replace(/[^\d]/g, "");
  if (!p) return raw;
  return p.startsWith("52") && p.length === 12 ? `+52 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : `+${p}`;
}

export function isPast(e: { start_at: string; end_at: string | null }, now = Date.now()): boolean {
  const end = e.end_at ? new Date(e.end_at).getTime() : new Date(e.start_at).getTime() + 3 * 3600 * 1000;
  return end < now;
}

// The dropdown's universe: real states from the data plus «En línea» for
// events without one (online events carry no state).
export const ONLINE_KEY = "__online";
export function stateKey(e: { state: string | null; modality: string }): string {
  return e.state ?? (e.modality === "online" ? ONLINE_KEY : "");
}
