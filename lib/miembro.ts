import { supabaseAdmin } from "./supabaseAdmin";
import { pageAll } from "./pageAll";
import { fetchBroker, type BrokerDetail } from "./data";

// The member dossier (Franz 2026-09-02): everything the network knows about
// one account, read-only. Built on fetchBroker (identity, ban state,
// inventory) plus the trails other tables keep about the member.

type Row = Record<string, unknown>;

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export type MemberRequest = {
  id: string;
  title: string | null;
  transaction: string | null;
  types: string[];
  states: string[];
  zona: string | null;
  price_min: number | null;
  price_max: number | null;
  status: string | null;
  lifecycle: string | null;
  visibility: string | null;
  created_at: string;
};

export type OrganizedEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  visibility: string;
  registered: number;
  attended: number;
};

export type AttendedEvent = {
  id: string;
  title: string;
  start_at: string;
  status: string;
  checked_in_at: string | null;
  upcoming: boolean; // computed here, not in the page (render must stay pure)
};

export type Person = {
  id: string;
  name: string | null;
  company: string | null;
  avatar_url: string | null;
  profile_type: string | null;
  since: string | null;
  status?: string | null;
};

export type ActivityItem = { at: string; kind: string; label: string; href?: string };

export type Dossier = {
  broker: BrokerDetail;
  email: string | null;
  zonas: string[];
  bio: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp_opt_in: boolean;
  profile_type: string;
  profile_data: Record<string, unknown> | null;
  platforms: string[];
  last_sign_in_at: string | null;
  counts: {
    inventory: number;
    requests: number;
    contacts: number;
    events_attended: number;
    sends: number;
    opens: number;
    favorites: number;
  };
  requests: MemberRequest[];
  eventsOrganized: OrganizedEvent[];
  eventsAttended: AttendedEvent[];
  contacts: Person[];
  vinculos: Person[];
  activity: ActivityItem[];
  moderation: {
    reportsMade: number;
    reportsReceived: number;
    blocksMade: number;
    blockedBy: number;
  };
};

export async function fetchMemberDossier(id: string): Promise<Dossier | null> {
  const broker = await fetchBroker(id);
  if (!broker) return null;
  const sb = supabaseAdmin();

  const [
    userRes,
    authRes,
    tokens,
    requests,
    organized,
    attended,
    connections,
    vinculos,
    sends,
    opens,
    saves,
    reportsMade,
    reportsReceived,
    blocksMade,
    blockedBy,
  ] = await Promise.all([
    sb
      .from("users")
      .select("email, zonas, bio, instagram, facebook, whatsapp_opt_in, profile_type, profile_data")
      .eq("id", id)
      .maybeSingle(),
    sb.auth.admin.getUserById(id),
    sb.from("push_tokens").select("platform").eq("user_id", id),
    pageAll<Row>(() =>
      sb
        .from("search_requests")
        .select("id, title, transaction, types, states, zona_key, reference_address, price_min, price_max, status, lifecycle, visibility, created_at")
        .eq("created_by", id)
        .order("created_at", { ascending: false }),
    ),
    pageAll<Row>(() =>
      sb
        .from("events")
        .select("id, title, start_at, end_at, visibility, attendees:event_attendees(status)")
        .eq("created_by", id)
        .order("start_at", { ascending: false }),
    ),
    pageAll<Row>(() =>
      sb
        .from("event_attendees")
        .select("status, created_at, checked_in_at, event:events!event_attendees_event_id_fkey(id, title, start_at)")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ),
    pageAll<Row>(() =>
      sb
        .from("connections")
        .select("requester_id, recipient_id, responded_at, created_at")
        .eq("status", "accepted")
        .or(`requester_id.eq.${id},recipient_id.eq.${id}`),
    ),
    pageAll<Row>(() =>
      sb
        .from("vinculos")
        .select("asesor_id, proveedor_id, status, responded_at, created_at")
        .or(`asesor_id.eq.${id},proveedor_id.eq.${id}`),
    ),
    pageAll<Row>(() =>
      sb
        .from("share_events")
        .select("created_at, kind, property:properties(id, name)")
        .eq("sharer_id", id)
        .order("created_at", { ascending: false }),
    ),
    sb.from("share_views").select("id", { count: "exact", head: true }).eq("sharer_id", id),
    pageAll<Row>(() =>
      sb.from("property_saves").select("created_at, property:properties(id, name)").eq("user_id", id),
    ),
    sb.from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", id),
    sb.from("reports").select("id", { count: "exact", head: true }).eq("target_owner_id", id),
    sb.from("blocks").select("blocked_id", { count: "exact", head: true }).eq("blocker_id", id),
    sb.from("blocks").select("blocker_id", { count: "exact", head: true }).eq("blocked_id", id),
  ]);

  const u = (userRes.data ?? {}) as {
    email?: string | null;
    zonas?: string[] | null;
    bio?: string | null;
    instagram?: string | null;
    facebook?: string | null;
    whatsapp_opt_in?: boolean | null;
    profile_type?: string | null;
    profile_data?: Record<string, unknown> | null;
  };

  // Counterparties (contacts + vínculos) resolve in one lookup.
  const otherIds = new Set<string>();
  const connOther = (c: Row) => (c.requester_id === id ? (c.recipient_id as string) : (c.requester_id as string));
  const vincOther = (v: Row) => (v.asesor_id === id ? (v.proveedor_id as string) : (v.asesor_id as string));
  for (const c of connections) otherIds.add(connOther(c));
  for (const v of vinculos) otherIds.add(vincOther(v));
  const people = new Map<string, Omit<Person, "since">>();
  if (otherIds.size) {
    const { data } = await sb.from("users").select("id, name, company, avatar_url, profile_type").in("id", [...otherIds]);
    for (const p of (data ?? []) as Omit<Person, "since">[]) people.set(p.id, p);
  }
  const person = (uid: string, since: string | null, status?: string | null): Person => ({
    id: uid,
    name: people.get(uid)?.name ?? null,
    company: people.get(uid)?.company ?? null,
    avatar_url: people.get(uid)?.avatar_url ?? null,
    profile_type: people.get(uid)?.profile_type ?? null,
    since,
    status,
  });

  const contacts = connections
    .map((c) => person(connOther(c), (c.responded_at ?? c.created_at) as string | null))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "es"));
  const vincs = vinculos
    .map((v) => person(vincOther(v), (v.responded_at ?? v.created_at) as string | null, v.status as string))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "es"));

  const requestRows: MemberRequest[] = requests.map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? null,
    transaction: (r.transaction as string) ?? null,
    types: (r.types as string[]) ?? [],
    states: (r.states as string[]) ?? [],
    zona: ((r.reference_address as string) || (r.zona_key as string)) ?? null,
    price_min: (r.price_min as number) ?? null,
    price_max: (r.price_max as number) ?? null,
    status: (r.status as string) ?? null,
    lifecycle: (r.lifecycle as string) ?? null,
    visibility: (r.visibility as string) ?? null,
    created_at: r.created_at as string,
  }));

  const eventsOrganized: OrganizedEvent[] = organized.map((e) => {
    const att = (e.attendees as { status: string }[]) ?? [];
    return {
      id: e.id as string,
      title: e.title as string,
      start_at: e.start_at as string,
      end_at: (e.end_at as string) ?? null,
      visibility: e.visibility as string,
      registered: att.filter((a) => a.status === "confirmed" || a.status === "attended").length,
      attended: att.filter((a) => a.status === "attended").length,
    };
  });

  const now = Date.now();
  const eventsAttended: AttendedEvent[] = attended
    .map((a): AttendedEvent | null => {
      const ev = one(a.event as { id: string; title: string; start_at: string } | null);
      return ev
        ? {
            id: ev.id,
            title: ev.title,
            start_at: ev.start_at,
            status: a.status as string,
            checked_in_at: (a.checked_in_at as string) ?? null,
            upcoming: new Date(ev.start_at).getTime() > now,
          }
        : null;
    })
    .filter((x): x is AttendedEvent => x != null)
    .sort((a, b) => (a.start_at < b.start_at ? 1 : -1));

  // One timeline out of every trail, newest first, capped.
  const activity: ActivityItem[] = [];
  for (const l of broker.listings) {
    if (l.created_at) activity.push({ at: l.created_at, kind: "propiedad", label: `Publicó «${l.name ?? "propiedad"}»` });
  }
  for (const r of requestRows) activity.push({ at: r.created_at, kind: "requerimiento", label: `Creó el requerimiento «${r.title ?? "sin título"}»` });
  for (const s of sends) {
    const prop = one(s.property as { id: string; name: string | null } | null);
    activity.push({
      at: s.created_at as string,
      kind: "envío",
      label: s.kind === "wa_capture" ? "Envió una captura de Público a un cliente" : `Envió la ficha de «${prop?.name ?? "una propiedad"}» a un cliente`,
    });
  }
  for (const a of attended) {
    const ev = one(a.event as { id: string; title: string } | null);
    if (!ev) continue;
    activity.push({ at: a.created_at as string, kind: "evento", label: `Se registró a «${ev.title}»`, href: `/eventos/${ev.id}` });
    if (a.checked_in_at) activity.push({ at: a.checked_in_at as string, kind: "asistencia", label: `Asistió a «${ev.title}»`, href: `/eventos/${ev.id}` });
  }
  for (const e of eventsOrganized) activity.push({ at: e.start_at, kind: "evento", label: `Organizó «${e.title}»`, href: `/eventos/${e.id}` });
  for (const c of contacts) if (c.since) activity.push({ at: c.since, kind: "contacto", label: `Conectó con ${c.name ?? "un miembro"}`, href: `/broker/${c.id}` });
  for (const v of vincs) if (v.since && v.status === "accepted") activity.push({ at: v.since, kind: "vínculo", label: `Se vinculó con ${v.name ?? "un miembro"}`, href: `/broker/${v.id}` });
  for (const s of saves) {
    const prop = one(s.property as { id: string; name: string | null } | null);
    activity.push({ at: s.created_at as string, kind: "favorito", label: `Guardó «${prop?.name ?? "una propiedad"}» en favoritos` });
  }
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  const platformSet = new Set<string>();
  for (const t of (tokens.data ?? []) as { platform: string | null }[]) if (t.platform) platformSet.add(t.platform);

  return {
    broker,
    email: u.email ?? null,
    zonas: u.zonas ?? [],
    bio: u.bio ?? null,
    instagram: u.instagram ?? null,
    facebook: u.facebook ?? null,
    whatsapp_opt_in: Boolean(u.whatsapp_opt_in),
    profile_type: u.profile_type ?? "asesor",
    profile_data: u.profile_data ?? null,
    platforms: [...platformSet].sort(),
    last_sign_in_at: authRes.data?.user?.last_sign_in_at ?? null,
    counts: {
      inventory: broker.listings.length,
      requests: requestRows.filter((r) => r.status === "open").length,
      contacts: contacts.length,
      events_attended: eventsAttended.filter((e) => e.status === "attended").length,
      sends: sends.length,
      opens: opens.count ?? 0,
      favorites: saves.length,
    },
    requests: requestRows,
    eventsOrganized,
    eventsAttended,
    contacts,
    vinculos: vincs,
    activity: activity.slice(0, 30),
    moderation: {
      reportsMade: reportsMade.count ?? 0,
      reportsReceived: reportsReceived.count ?? 0,
      blocksMade: blocksMade.count ?? 0,
      blockedBy: blockedBy.count ?? 0,
    },
  };
}
