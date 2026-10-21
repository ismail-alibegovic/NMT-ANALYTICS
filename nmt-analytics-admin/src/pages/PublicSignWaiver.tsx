import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { Helmet } from "react-helmet-async";
import PageMeta from "../components/common/PageMeta";
import { useT } from "../lib/i18n";
import api from "../lib/apiClient";

type Declaration = { id: string; label: string; required?: boolean };
type Waiver = {
  template_title: string; template_body: string; passenger_name: string;
  package_name: string | null; destination: string | null; expires_at: string;
  declarations: Declaration[];
};
const copy = {
  en: {
    title: "Passenger consent", loading: "Loading consent…", unavailable: "This consent link is invalid or no longer available. Contact your agency.",
    name: "Full name", agree: "I have read the terms and confirm my consent.", signature: "Drawn signature (optional)",
    typed: "Your full name is recorded with your consent. You may also draw a signature.",
    clear: "Clear signature", submit: "Confirm consent", saving: "Saving…", failed: "Consent could not be saved. Your entries are preserved; please retry.",
    done: "Consent recorded", doneBody: "This consent has been signed. The link cannot be used again.", expires: "Link expires",
  },
  bs: {
    title: "Pristanak putnika", loading: "Učitavanje pristanka…", unavailable: "Link za pristanak nije važeći ili više nije dostupan. Kontaktirajte agenciju.",
    name: "Puno ime", agree: "Pročitao/la sam uslove i potvrđujem svoj pristanak.", signature: "Nacrtani potpis (opcionalno)",
    typed: "Vaše puno ime se evidentira uz pristanak. Možete dodati i nacrtani potpis.",
    clear: "Obriši potpis", submit: "Potvrdi pristanak", saving: "Snimanje…", failed: "Pristanak nije sačuvan. Uneseni podaci su zadržani; pokušajte ponovo.",
    done: "Pristanak evidentiran", doneBody: "Pristanak je potpisan. Link se ne može ponovo koristiti.", expires: "Link ističe",
  },
};
export default function PublicSignWaiver() {
  const { token = "" } = useParams();
  const { lang } = useT(); const c = copy[lang];
  const [waiver, setWaiver] = useState<Waiver | null>(null);
  const [loading, setLoading] = useState(true), [unavailable, setUnavailable] = useState(false);
  const [done, setDone] = useState(false), [error, setError] = useState(false);
  const [name, setName] = useState(""), [agreed, setAgreed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false), [hasDrawing, setHasDrawing] = useState(false);
  const locked = useRef(false), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setUnavailable(false); setDone(false); setWaiver(null); setError(false);
    setAgreed(false); setAnswers({}); setHasDrawing(false);
    api.get<Waiver>(`/public/waiver/${encodeURIComponent(token)}`).then(({ data }) => {
      if (active) { setWaiver(data); setName(data.passenger_name || ""); }
    }).catch((e: any) => {
      if (active) {
        if (e?.response?.data?.code === "ALREADY_SIGNED") setDone(true);
        else setUnavailable(true);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    const pad = canvas.current, ctx = pad?.getContext("2d");
    if (!pad || !ctx) return;
    ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 2; ctx.lineCap = "round";
    let previous: { x: number; y: number } | null = null;
    const point = (e: PointerEvent) => {
      const box = pad.getBoundingClientRect();
      return { x: (e.clientX - box.left) * pad.width / box.width, y: (e.clientY - box.top) * pad.height / box.height };
    };
    const start = (e: PointerEvent) => { if (locked.current) return; previous = point(e); pad.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!previous || locked.current) return;
      const p = point(e); ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      previous = p; setHasDrawing(true);
    };
    const end = () => { previous = null; };
    pad.addEventListener("pointerdown", start); pad.addEventListener("pointermove", move);
    pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
    return () => {
      pad.removeEventListener("pointerdown", start); pad.removeEventListener("pointermove", move);
      pad.removeEventListener("pointerup", end); pad.removeEventListener("pointercancel", end);
    };
  }, [waiver, done, loading]);
  const clear = () => {
    const pad = canvas.current; if (!pad || locked.current) return;
    pad.getContext("2d")?.clearRect(0, 0, pad.width, pad.height); setHasDrawing(false);
  };
  const valid = !!name.trim() && agreed && (waiver?.declarations || []).every(d => !d.required || answers[d.id] === true);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!valid || locked.current) return;
    locked.current = true; setSaving(true); setError(false);
    try {
      await api.post(`/public/waiver/${encodeURIComponent(token)}/sign`, {
        signer_name: name.trim(), agreed: true, declarations: answers,
        ...(hasDrawing && canvas.current ? { signature_png: canvas.current.toDataURL("image/png").split(",")[1] } : {}),
      });
      setDone(true);
    } catch (e: any) {
      if (e?.response?.data?.code === "ALREADY_SIGNED") setDone(true);
      else setError(true);
    } finally { locked.current = false; setSaving(false); }
  };
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-gray-950 dark:text-gray-100">
    <Helmet><meta name="referrer" content="no-referrer" /></Helmet>
    <PageMeta title={c.title + " | Travline"} description={c.title} />
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900 sm:p-8">
      {loading ? <p role="status">{c.loading}</p> : done ? <div role="status"><h1 className="text-2xl font-bold">{c.done}</h1><p className="mt-4">{c.doneBody}</p></div> :
        unavailable || !waiver ? <p role="alert">{c.unavailable}</p> : <>
          <h1 className="break-words text-2xl font-bold">{waiver.template_title}</h1>
          <p className="mt-3 break-words">{[waiver.package_name, waiver.destination].filter(Boolean).join(" · ")}</p>
          <p className="my-6 whitespace-pre-wrap break-words leading-relaxed">{waiver.template_body}</p>
          <p className="mb-5 text-sm">{c.expires}: {new Date(waiver.expires_at).toLocaleString(lang === "bs" ? "bs-BA" : "en-GB")}</p>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">{c.name}<input required maxLength={200} autoComplete="name" disabled={saving} value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800" /></label>
            <p className="text-sm">{c.typed}</p>
            <fieldset disabled={saving} className="space-y-3">
              {(waiver.declarations || []).map(d => <label key={d.id} className="flex items-start gap-3"><input type="checkbox" required={d.required} checked={!!answers[d.id]} onChange={e => setAnswers(old => ({ ...old, [d.id]: e.target.checked }))} className="mt-1" /><span>{d.label}{d.required ? " *" : ""}</span></label>)}
              <label className="flex items-start gap-3"><input type="checkbox" required checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1" /><span>{c.agree}</span></label>
            </fieldset>
            <p id="signature-label">{c.signature}</p>
            <canvas ref={canvas} width={600} height={180} aria-labelledby="signature-label" className="block w-full touch-none rounded-lg border border-slate-300 bg-white" style={{ aspectRatio: "10 / 3" }} />
            <button type="button" disabled={saving || !hasDrawing} onClick={clear} className="rounded-lg border px-3 py-2 disabled:opacity-50">{c.clear}</button>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">{c.failed}</p>}
            <button type="submit" disabled={!valid || saving} className="block w-full rounded-lg bg-blue-600 p-3 font-medium text-white disabled:opacity-50">{saving ? c.saving : c.submit}</button>
          </form>
        </>}
    </section>
  </main>;
}
