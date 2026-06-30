import { useState, useEffect } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import Select from "../form/Select";
import { useToast } from "../../context/ToastContext";
import { getPackages, Package } from "../../api/packages";
import { getDepartures, Departure } from "../../api/departures";
import { getReservation, updateReservation, Reservation } from "../../api/reservations";

interface EditReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  reservationId: string | null;
}

export default function EditReservationModal({
  isOpen,
  onClose,
  onSuccess,
  reservationId,
}: EditReservationModalProps) {
  const { success: showSuccess, error: showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [packageId, setPackageId] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [totalAmount, setTotalAmount] = useState("");
  const [status, setStatus] = useState<string>("pending");

  // Fetch packages once
  useEffect(() => {
    if (isOpen) {
      getPackages({ limit: 200 }).then((res) => setPackages(res.data)).catch(() => {});
    }
  }, [isOpen]);

  // Load reservation data when modal opens
  useEffect(() => {
    if (!isOpen || !reservationId) return;
    setLoading(true);
    getReservation(reservationId)
      .then(async (res) => {
        setCustomerName(res.customerName);
        setCustomerPhone(res.customerPhone || "");
        setPartySize(res.participants || res.partySize || 1);
        setTotalAmount(String(res.totalAmount || 0));
        setStatus(res.status);

        // If there's a departure, find the package
        if (res.departureId) {
          setDepartureId(res.departureId);
          // Fetch departures to find the package
          try {
            const depRes = await getDepartures({ limit: 500 });
            const dep = depRes.data.find((d) => d.id === res.departureId);
            if (dep) {
              setPackageId(dep.package_id);
              // Fetch departures for this package
              const pkgDeps = await getDepartures({ packageId: dep.package_id, limit: 200 });
              setDepartures(pkgDeps.data);
            }
          } catch {}
        }
      })
      .catch(() => showError("Failed to load reservation"))
      .finally(() => setLoading(false));
  }, [isOpen, reservationId]);

  // Fetch departures when package changes
  useEffect(() => {
    if (!packageId) {
      setDepartures([]);
      if (!departureId) return;
      setDepartureId("");
      return;
    }
    getDepartures({ packageId, limit: 200 })
      .then((res) => setDepartures(res.data))
      .catch(() => {});
  }, [packageId]);

  const handleSubmit = async () => {
    if (!reservationId) return;
    if (!customerName) {
      showError("Ime klijenta je obavezno");
      return;
    }

    setSubmitting(true);
    try {
      await updateReservation(reservationId, {
        customerName,
        customerPhone: customerPhone || undefined,
        partySize,
        departureId: departureId || undefined,
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        status: status as Reservation["status"],
      });

      showSuccess("Rezervacija ažurirana");
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err?.message || "Greška pri ažuriranju");
    } finally {
      setSubmitting(false);
    }
  };

  const statusOptions = [
    { value: "pending", label: "Na čekanju" },
    { value: "confirmed", label: "Potvrđeno" },
    { value: "cancelled", label: "Otkazano" },
    { value: "completed", label: "Završeno" },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl" title="Uredi rezervaciju">
      <div className="p-6 pt-4 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center p-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ime i prezime</Label>
                <Input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Aranžman</Label>
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
                >
                  <option value="">-- Bez promjene --</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} - {pkg.destination}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Polazak</Label>
                <select
                  value={departureId}
                  onChange={(e) => setDepartureId(e.target.value)}
                  disabled={!packageId}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800 disabled:opacity-50"
                >
                  <option value="">-- Bez polaska --</option>
                  {departures
                    .filter((d) => d.status === "active")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {new Date(d.depart_at).toLocaleDateString("bs-BA")} ({d.booked}/{d.capacity})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Broj osoba</Label>
                <Input
                  type="number"
                  min={1}
                  value={String(partySize)}
                  onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div>
                <Label>Iznos (BAM)</Label>
                <Input
                  type="number"
                  min={0}
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  options={statusOptions}
                  placeholder="Odaberite status"
                  defaultValue={status}
                  onChange={(value) => setStatus(value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Odustani
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || loading}>
                {submitting ? "Spremanje..." : "Spremi izmjene"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
