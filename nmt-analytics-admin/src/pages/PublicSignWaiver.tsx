import { useState, useEffect, useRef } from "react";
import PageMeta from "../components/common/PageMeta";

interface WaiverData {
  template_title: string;
  template_body: string;
  passenger_name: string;
  org_name: string | null;
  package_name: string | null;
  destination: string | null;
  depart_at: string | null;
  status: "pending" | "signed" | "expired" | "revoked" | "not_found";
  signed_at: string | null;
  signed_ip: string | null;
  expires_at: string | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending:   { label: "Čeka potpis",            color: "amber"    },
  signed:    { label: "Potpisano",              color: "emerald"  },
  expired:   { label: "Isteklo",                 color: "rose"     },
  revoked:   { label: "Povučeno",                color: "rose"     },
  not_found: { label: "Nepoznati zahtjev",       color: "slate"    },
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString("bs-BA", { dateStyle: "medium", timeStyle: "short" });
}

export default function PublicSignWaiver() {
  const token = window.location.pathname.split("/").pop() || "";
  const [data, setData] = useState<WaiverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSignatureRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const api = (await import("../lib/apiClient")).default;
        const res = await api.get(`/public/waiver/${token}`);
        const d = res.data;
        setData(d);
        if (d.passenger_name) setName(d.passenger_name);
        if (d.status === "signed") setSigned(true);
      } catch (e: any) {
        setError(e?.response?.data?.message || "Nije moguće učitati waiver.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Signature canvas handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    let lastPoint: { x: number; y: number } | null = null;

    const getPoint = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e: PointerEvent) => {
      drawingRef.current = true;
      lastPoint = getPoint(e);
      hasSignatureRef.current = true;
    };
    const move = (e: PointerEvent) => {
      if (!drawingRef.current || !lastPoint) return;
      const p = getPoint(e);
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPoint = p;
    };
    const end = () => {
      drawingRef.current = false;
      lastPoint = null;
    };

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", end);
    return () => {
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointerleave", end);
    };
  }, [loading, signed]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignatureRef.current = false;
  };

  const submit = async () => {
    if (!name.trim() || !agree) return;
    if (!hasSignatureRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    // Strip the data: prefix to send raw base64 payload
    const signatureData = dataUrl.replace(/^data:image\/png;base64,/, "");

    setSubmitting(true);
    try {
      const api = (await import("../lib/apiClient")).default;
      await api.post(`/public/waiver/${token}/sign`, {
        signed_name: name.trim(),
        signature_image: signatureData,
      });
      setSigned(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Slanje nije uspjelo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Greška</h1>
          <p className="text-sm text-slate-600">{error || "Nepoznata greška"}</p>
        </div>
      </main>
    );
  }

  const status = STATUS_META[data.status] || STATUS_META.not_found;
  const isPending = data.status === "pending";
  const canSign = isPending && name.trim() && agree && hasSignatureRef.current && !submitting;

  return (
    <>
      <PageMeta title={`${data.template_title} | Travline`} description="Digitalni pristanak putnika" />
      <main className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header card with org branding accent */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="h-1.5 bg-blue-600" />
            <div className="px-6 sm:px-8 py-6">
              <div className="flex items-start justify-between gap-4 mb-1">
                <h1 className="text-2xl font-bold text-slate-900">{data.template_title}</h1>
                <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-700`}>
                  {status.label}
                </span>
              </div>
              {data.org_name && (
                <p className="text-sm text-slate-500 mb-4">{data.org_name}</p>
              )}

              {/* Trip context */}
              {(data.package_name || data.destination || data.depart_at) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 text-sm">
                  {data.package_name && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-0.5">Aranžman</div>
                      <div className="font-medium text-slate-700">{data.package_name}</div>
                    </div>
                  )}
                  {data.destination && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-0.5">Destinacija</div>
                      <div className="font-medium text-slate-700">{data.destination}</div>
                    </div>
                  )}
                  {data.depart_at && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-0.5">Polazak</div>
                      <div className="font-medium text-slate-700">{fmtDate(data.depart_at)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Waiver body */}
              <div className="prose prose-sm prose-slate max-w-none mb-6">
                <p className="whitespace-pre-line text-slate-700 leading-relaxed">{data.template_body}</p>
              </div>

              {data.expires_at && isPending && (
                <p className="text-xs text-slate-500 mb-4">
                  Link ističe {fmtDate(data.expires_at)}.
                </p>
              )}

              {signed && data.signed_at && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="size-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-emerald-800">Pristanak potvrđen</div>
                      <div className="text-xs text-emerald-600">Potpisano {fmtDate(data.signed_at)}</div>
                    </div>
                  </div>
                </div>
              )}

              {isPending && !signed && (
                <>
                  {/* Name */}
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Puno ime
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Vaše puno ime"
                    className="w-full px-3 py-2 mb-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                  />

                  {/* Signature pad */}
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Potpišite ovdje
                  </label>
                  <div className="border border-slate-300 rounded-lg mb-2 bg-white relative">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={180}
                      className="w-full touch-none cursor-crosshair"
                      style={{ aspectRatio: "10 / 3" }}
                    />
                    <button
                      onClick={clearSignature}
                      className="absolute top-2 right-2 text-xs text-slate-500 hover:text-slate-700 bg-white/80 backdrop-blur-sm px-2 py-1 rounded"
                    >
                      Obriši
                    </button>
                  </div>

                  {/* Agreement checkbox */}
                  <label className="flex items-start gap-3 mt-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Pročitao/la sam i razumio/la gore navedeni tekst, te svojim potpisom dajem pristanak.</span>
                  </label>

                  <button
                    onClick={submit}
                    disabled={!canSign}
                    className="mt-5 w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? "Slanje..." : "Pošalji pristanak"}
                  </button>
                </>
              )}

              {(data.status === "expired" || data.status === "revoked") && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
                  Ovaj link više nije važeći. Kontaktirajte agenciju za novi link.
                </div>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            Travline · Digitalni pristanak
          </p>
        </div>
      </main>
    </>
  );
}
