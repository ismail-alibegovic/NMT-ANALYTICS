import { useState, useEffect } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { useToast } from "../../context/ToastContext";
import { getPackages, Package } from "../../api/packages";
import { getDepartures, Departure } from "../../api/departures";
import { getCustomers, Customer } from "../../api/customers";
import { createReservation } from "../../api/reservations";

interface CreateReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateReservationModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateReservationModalProps) {
  const { success: showSuccess, error: showError } = useToast();

  const [packages, setPackages] = useState<Package[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [packageId, setPackageId] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [totalAmount, setTotalAmount] = useState("");
  const [source, setSource] = useState("agent");

  useEffect(() => {
    if (isOpen) {
      fetchInitial();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setCustomerSearch("");
    setSelectedCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setPackageId("");
    setDepartureId("");
    setPartySize(1);
    setTotalAmount("");
    setSource("agent");
    setDepartures([]);
  };

  const fetchInitial = async () => {
    setLoadingData(true);
    try {
      const [pkgRes, custRes] = await Promise.all([
        getPackages({ limit: 200 }),
        getCustomers({ limit: 200 }),
      ]);
      setPackages(pkgRes.data);
      setCustomers(custRes.data);
    } catch {
      showError("Failed to load data");
    } finally {
      setLoadingData(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase();
    return (
      !customerSearch ||
      c.full_name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!packageId) {
      setDepartures([]);
      setDepartureId("");
      return;
    }
    setDepartureId("");

    // Also set default price from selected package
    const pkg = packages.find((p) => p.id === packageId);
    if (pkg && !totalAmount) {
      setTotalAmount(String(pkg.price || pkg.base_price || ""));
    }

    getDepartures({ packageId, limit: 200 })
      .then((res) => setDepartures(res.data))
      .catch(() => {});
  }, [packageId]);

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.full_name);
    setCustomerPhone(c.phone);
    setCustomerSearch("");
  };

  const handleSubmit = async () => {
    if (!customerName || !customerPhone) {
      showError("Ime i telefon klijenta su obavezni");
      return;
    }

    setSubmitting(true);
    try {
      await createReservation({
        customerName,
        customerPhone,
        partySize,
        reservationAt: new Date().toISOString(),
        departureId: departureId || undefined,
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        source: source as any,
        customerId: selectedCustomerId || undefined,
        status: "pending",
      });

      showSuccess("Rezervacija kreirana");
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err?.message || "Greška pri kreiranju rezervacije");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl" title="Nova rezervacija">
      <div className="p-6 pt-4 space-y-5">
        {/* Customer selection */}
        <div>
          <Label>Klijent</Label>
          <div className="relative">
            <Input
              type="text"
              placeholder="Pretraži postojećeg klijenta..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                if (!e.target.value && !selectedCustomerId) return;
                setSelectedCustomerId(null);
                if (!e.target.value) {
                  setCustomerName("");
                  setCustomerPhone("");
                }
              }}
            />
            {customerSearch && filteredCustomers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredCustomers.slice(0, 10).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                    onClick={() => handleSelectCustomer(c)}
                  >
                    <div className="font-medium">{c.full_name}</div>
                    <div className="text-xs text-gray-500">{c.phone}{c.email ? ` • ${c.email}` : ""}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedCustomerId && (
            <p className="text-xs text-green-600 mt-1">✓ Odabran: {customerName}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Ime i prezime *</Label>
            <Input
              type="text"
              placeholder="Npr. Ahmed Hodžić"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setSelectedCustomerId(null);
              }}
            />
          </div>
          <div>
            <Label>Telefon *</Label>
            <Input
              type="tel"
              placeholder="+387 61 234 567"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                setSelectedCustomerId(null);
              }}
            />
          </div>
        </div>

        {/* Package & Departure */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Aranžman / Paket</Label>
            <select
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
            >
              <option value="">-- Bez aranžmana --</option>
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
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 disabled:opacity-50"
            >
              <option value="">-- Odaberite polazak --</option>
              {departures
                .filter((d) => d.status === "active" && d.booked < d.capacity)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {new Date(d.depart_at).toLocaleDateString("bs-BA")} — {d.booked}/{d.capacity} popunjeno
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Party size & Amount */}
        <div className="grid grid-cols-2 gap-4">
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
            <Label>Ukupan iznos (BAM)</Label>
            <Input
              type="number"
              min={0}
              placeholder="0.00"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Source */}
        <div>
          <Label>Izvor rezervacije</Label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
          >
            <option value="agent">Agent (lično)</option>
            <option value="phone">Telefon</option>
            <option value="walk-in">Šalter</option>
            <option value="web">Web</option>
            <option value="other">Ostalo</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Odustani
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loadingData}>
            {submitting ? "Kreiranje..." : "Kreiraj rezervaciju"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
