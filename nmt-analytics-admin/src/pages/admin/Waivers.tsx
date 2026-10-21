import { useCallback, useEffect, useRef, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import { useT } from "../../lib/i18n";
import api from "../../lib/apiClient";

type Template = { id: string; title: string; body_text: string; is_active: boolean };
type RecordRow = { id: string; passenger_name_snapshot: string; template_title: string; status: string; signed_at: string | null };
type Departure = { id: string; depart_at: string; package_name: string; passengers: Array<{ passengerId: string; fullName: string }> };
const copy = {
  en: {
    title: "Passenger consent", templates: "Consent template", add: "New template", edit: "Edit template", titleLabel: "Title", body: "Terms",
    active: "Active", save: "Save", cancel: "Cancel", saving: "Saving…", issue: "Issue consent link", departure: "Departure", passenger: "Passenger",
    select: "Select", history: "Issued consent", status: "Status", pending: "Pending", signed: "Signed", expired: "Expired", revoked: "Revoked",
    revoke: "Revoke unused link", confirm: "Revoke this unused consent link?", copy: "Copy link", copied: "Link copied", pdf: "Signed PDF",
    failure: "The request failed. Your entries are preserved; please retry.", retry: "Reload", loading: "Loading…",
    fresh: "Copy the link now. Links are only shown when issued; revoke and reissue a lost link.",
    empty: "No consent has been issued.", inactive: "Inactive", copiedFail: "The link could not be copied. Select and copy it from the field.",
    noPassengers: "No excursion passengers on this departure.", missing: "Create or activate a consent template before issuing links.",
  },
  bs: {
    title: "Pristanak putnika", templates: "Predložak pristanka", add: "Novi predložak", edit: "Uredi predložak", titleLabel: "Naslov", body: "Uslovi",
    active: "Aktivan", save: "Sačuvaj", cancel: "Otkaži", saving: "Snimanje…", issue: "Izdaj link za pristanak", departure: "Polazak", passenger: "Putnik",
    select: "Odaberi", history: "Izdati pristanci", status: "Status", pending: "Na čekanju", signed: "Potpisano", expired: "Isteklo", revoked: "Povučeno",
    revoke: "Povuci nepotpisani link", confirm: "Povući ovaj nepotpisani link za pristanak?", copy: "Kopiraj link", copied: "Link kopiran", pdf: "Potpisani PDF",
    failure: "Zahtjev nije uspio. Uneseni podaci su zadržani; pokušajte ponovo.", retry: "Učitaj ponovo", loading: "Učitavanje…",
    fresh: "Kopirajte link sada. Link se prikazuje samo pri izdavanju; izgubljeni link povucite i izdajte novi.",
    empty: "Nema izdatih pristanaka.", inactive: "Neaktivan", copiedFail: "Link nije kopiran. Označite ga i kopirajte iz polja.",
    noPassengers: "Na ovom polasku nema putnika ekskurzije.", missing: "Kreirajte ili aktivirajte predložak prije izdavanja linkova.",
  },
};
const field = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";
const button = "rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 disabled:opacity-50";
export default function WaiversPage() {
  const { lang } = useT(); const c = copy[lang];
  const [templates, setTemplates] = useState<Template[]>([]), [rows, setRows] = useState<RecordRow[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [open, setOpen] = useState(false), [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [active, setActive] = useState(true);
  const [departure, setDeparture] = useState(""), [passenger, setPassenger] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [t, w, d] = await Promise.all([api.get<Template[]>("/waiver-templates"), api.get<RecordRow[]>("/waivers"), api.get<Departure[]>("/waivers/departures")]);
      setTemplates(t.data); setRows(w.data); setDepartures(d.data);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPassenger(""); setLink(null); }, [departure]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailed(false); setNotice("");
    try { await action(); } catch { setFailed(true); } finally { lock.current = false; setBusy(false); }
  };
  const edit = (template?: Template) => {
    setEditing(template?.id || null); setTitle(template?.title || ""); setBody(template?.body_text || "");
    setActive(template?.is_active ?? true); setFailed(false); setOpen(true);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault(); if (!title.trim() || !body.trim()) return;
    void run(async () => {
      const payload = { title: title.trim(), body_text: body.trim(), is_active: active };
      if (editing) await api.patch("/waiver-templates/" + editing, payload);
      else await api.post("/waiver-templates", payload);
      setOpen(false); await load();
    });
  };
  const issue = (event: React.FormEvent) => {
    event.preventDefault(); if (!passenger) return;
    void run(async () => {
      const { data } = await api.post<{ waiver_id: string; sign_url: string }>("/waivers/issue", { passenger_id: passenger });
      setLink({ id: data.waiver_id, url: window.location.origin + data.sign_url }); await load();
    });
  };
  const revoke = (id: string) => {
    if (!window.confirm(c.confirm)) return;
    void run(async () => { await api.post("/waivers/" + id + "/revoke"); if (link?.id === id) setLink(null); await load(); });
  };
  const pdf = (id: string) => void run(async () => {
    const { data } = await api.get("/waivers/" + id + "/pdf", { responseType: "blob" });
    const url = URL.createObjectURL(data); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "consent-" + id + ".pdf"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const selected = departures.find(d => d.id === departure);
  return <>
    <PageMeta title={c.title + " | Travline"} description={c.title} />
    <main className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 dark:text-gray-100 sm:p-6">
      <h1 className="text-2xl font-bold">{c.title}</h1>
      {loading && <p role="status">{c.loading}</p>}
      {loadError && <div role="alert">{c.failure} <button type="button" className={button} onClick={() => void load()}>{c.retry}</button></div>}
      {failed && !open && <p role="alert">{c.failure}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold">{c.templates}</h2>
        {!templates.length && <button type="button" disabled={busy || loading || loadError} onClick={() => edit()} className={button}>{c.add}</button>}
        {templates.map(t => <div key={t.id} className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 break-words font-medium">{t.title} {!t.is_active && "· " + c.inactive}</p>
          <button type="button" disabled={busy} onClick={() => edit(t)} className={button}>{c.edit}</button>
        </div>)}
      </section>
      <section className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold">{c.issue}</h2>
        {!templates.some(t => t.is_active) && <p>{c.missing}</p>}
        <form onSubmit={issue} className="space-y-4">
          <label htmlFor="waiver-departure" className="block">{c.departure}</label>
          <select id="waiver-departure" required disabled={busy} value={departure} onChange={e => setDeparture(e.target.value)} className={field}>
            <option value="">{c.select}</option>{departures.map(d => <option value={d.id} key={d.id}>{d.package_name} · {new Date(d.depart_at).toLocaleString(lang === "bs" ? "bs-BA" : "en-GB")}</option>)}
          </select>
          <label htmlFor="waiver-passenger" className="block">{c.passenger}</label>
          <select id="waiver-passenger" required disabled={busy || !selected} value={passenger} onChange={e => setPassenger(e.target.value)} className={field}>
            <option value="">{c.select}</option>{selected?.passengers.map(p => <option value={p.passengerId} key={p.passengerId}>{p.fullName}</option>)}
          </select>
          {selected && !selected.passengers.length && <p>{c.noPassengers}</p>}
          <button type="submit" className={button} disabled={busy || !passenger || !templates.some(t => t.is_active)}>{busy ? c.saving : c.issue}</button>
        </form>
        {link && <div className="space-y-2"><p>{c.fresh}</p><label className="block">{c.issue}<input readOnly value={link.url} className={field} /></label>
          <button type="button" className={button} onClick={() => {
            navigator.clipboard.writeText(link.url).then(() => setNotice(c.copied)).catch(() => setNotice(c.copiedFail));
          }}>{c.copy}</button></div>}
      </section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">{c.history}</h2>
        {!rows.length ? <p>{c.empty}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">{c.passenger}</th><th className="p-2">{c.templates}</th><th className="p-2">{c.status}</th><th className="p-2"><span className="sr-only">{c.edit}</span></th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700">
            <td className="p-2">{row.passenger_name_snapshot}</td><td className="p-2">{row.template_title}</td>
            <td className="p-2">{c[row.status as "pending" | "signed" | "expired" | "revoked"] || row.status}</td>
            <td className="p-2">{["pending", "expired"].includes(row.status) && <button type="button" className={button} disabled={busy} onClick={() => revoke(row.id)}>{c.revoke}</button>}
              {row.status === "signed" && <button type="button" className={button} disabled={busy} onClick={() => pdf(row.id)}>{c.pdf}</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </main>
    <Modal isOpen={open} onClose={() => { if (!lock.current) setOpen(false); }} title={editing ? c.edit : c.add} scrollable className="max-w-2xl">
      <form onSubmit={save} className="space-y-4 p-6">
        <label className="block">{c.titleLabel}<input required maxLength={200} disabled={busy} value={title} onChange={e => setTitle(e.target.value)} className={field} /></label>
        <label className="block">{c.body}<textarea required maxLength={20000} rows={8} disabled={busy} value={body} onChange={e => setBody(e.target.value)} className={field} /></label>
        <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={active} onChange={e => setActive(e.target.checked)} />{c.active}</label>
        {failed && <p role="alert">{c.failure}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={busy} className={button} onClick={() => setOpen(false)}>{c.cancel}</button>
          <button type="submit" disabled={busy || !title.trim() || !body.trim()} className={button}>{busy ? c.saving : c.save}</button>
        </div>
      </form>
    </Modal>
  </>;
}
