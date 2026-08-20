import { type ReactNode, useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import Input from "../../components/form/input/InputField";
import Label from "../../components/form/Label";
import Badge from "../../components/ui/badge/Badge";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { EyeIcon, TableIcon, TrashBinIcon, PlusIcon } from "../../icons";
import {
  getHotels, createHotel, deleteHotel,
  getHotelRooms, createHotelRoom, deleteHotelRoom,
  createHotelAllocation,
  Hotel, HotelRoom,
} from "../../api/operations";
import { getDepartures, Departure } from "../../api/departures";

const starOptions = Array.from({ length: 5 }, (_, i) => ({ value: String(i + 1), label: "★".repeat(i + 1) + " " + (i + 1) }));
const currencyOptions = [{ value: "BAM", label: "BAM" }, { value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }];

export default function Hotels() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const tr = t.operations.hotels;
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [selectedRooms, setSelectedRooms] = useState<HotelRoom[]>([]);
  const [selectedDeparture, setSelectedDeparture] = useState("");
  const [departureList, setDepartureList] = useState<Departure[]>([]);

  const [formName, setFormName] = useState("");
  const [formDestination, setFormDestination] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formTotalRooms, setFormTotalRooms] = useState(10);
  const [formStars, setFormStars] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmenities, setFormAmenities] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWebsite, setFormWebsite] = useState("");

  const [roomType, setRoomType] = useState("");
  const [roomCapacity, setRoomCapacity] = useState(2);
  const [roomPrice, setRoomPrice] = useState(50);
  const [roomCurrency, setRoomCurrency] = useState("BAM");

  const [allocRoomType, setAllocRoomType] = useState("");
  const [allocRoomsReserved, setAllocRoomsReserved] = useState(5);
  const [allocCheckIn, setAllocCheckIn] = useState("");
  const [allocCheckOut, setAllocCheckOut] = useState("");
  const [allocPricePerNight, setAllocPricePerNight] = useState(50);

  const fetchHotels = async () => {
    setLoading(true);
    try { const data = await getHotels(); setHotels(data); setLoading(false); }
    catch (err: any) { showError(err.message || "Failed to load hotels"); setLoading(false); }
  };

  useEffect(() => {
    if (user && !authLoading) fetchHotels();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  useEffect(() => {
    if (roomModalOpen && selectedHotel) {
      getHotelRooms(selectedHotel.id).then(setSelectedRooms).catch(() => setSelectedRooms([]));
      getDepartures({ limit: 200 }).then((r) => setDepartureList(r.data || [])).catch(() => setDepartureList([]));
    }
  }, [roomModalOpen, selectedHotel]);

  const resetHotelForm = () => {
    setFormName(""); setFormDestination(""); setFormAddress(""); setFormContact("");
    setFormTotalRooms(10); setFormStars(""); setFormDescription(""); setFormAmenities("");
    setFormEmail(""); setFormWebsite("");
  };

  const handleCreateHotel = async () => {
    setSaving(true);
    try {
      await createHotel({
        name: formName, destination: formDestination, address: formAddress || undefined,
        contact: formContact || undefined, totalRooms: formTotalRooms,
        stars: formStars ? Number(formStars) : null,
        description: formDescription || undefined,
        amenities: formAmenities ? formAmenities.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
        email: formEmail || undefined, website: formWebsite || undefined,
      });
      showSuccess(tr.saved || "Hotel created");
      resetHotelForm(); setIsModalOpen(false); fetchHotels();
    } catch (err: any) { showError(err.message || "Failed to create hotel"); }
    finally { setSaving(false); }
  };

  const handleDeleteHotel = async (h: Hotel) => {
    if (!confirm(`Delete hotel ${h.name}?`)) return;
    try { await deleteHotel(h.id); showSuccess("Hotel deleted"); fetchHotels(); }
    catch (err: any) { showError(err.message || "Failed to delete hotel"); }
  };

  const handleCreateRoom = async () => {
    if (!selectedHotel) return;
    try {
      await createHotelRoom(selectedHotel.id, { roomType, capacity: roomCapacity, basePrice: roomPrice, currency: roomCurrency });
      showSuccess("Room type added"); setRoomType(""); setRoomModalOpen(false); fetchHotels();
    } catch (err: any) { showError(err.message || "Failed to add room"); }
  };

  const handleDeleteRoom = async (roomId: string) => {
    try { await deleteHotelRoom(roomId); showSuccess("Room deleted"); fetchHotels(); }
    catch (err: any) { showError(err.message || "Failed to delete room"); }
  };

  const handleCreateAllocation = async () => {
    if (!selectedHotel || !selectedDeparture) return;
    try {
      await createHotelAllocation(selectedDeparture, {
        hotelId: selectedHotel.id, roomType: allocRoomType,
        roomsReserved: allocRoomsReserved, checkIn: allocCheckIn,
        checkOut: allocCheckOut, pricePerNight: allocPricePerNight,
      });
      showSuccess("Allocation created"); setAllocModalOpen(false); fetchHotels();
    } catch (err: any) { showError(err.message || "Failed to create allocation"); }
  };

  const columns: Column<Hotel>[] = [
    { key: "name", header: tr.name || "Hotel", render: (v, h) => (
      <div className="flex flex-col">
        <span className="font-medium text-gray-900 dark:text-white">{v as string}</span>
        {(h as Hotel).address && <span className="text-xs text-gray-500 dark:text-gray-400">{(h as Hotel).address}</span>}
      </div>) },
    { key: "destination", header: tr.destination || "Destination", render: (v) => <span className="text-gray-600 dark:text-gray-300">{v as string}</span> },
    { key: "rooms", header: tr.roomTypes || "Room Types", render: (_v, h) => {
      const rooms = (h as Hotel).rooms || [];
      const totalAvail = rooms.reduce((s, r) => s + (r.available || 0), 0);
      const totalCap = rooms.reduce((s, r) => s + (r.total || 0), 0);
      if (rooms.length === 0) return <span className="text-xs text-gray-400">—</span>;
      return (
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-gray-700 dark:text-gray-300">{rooms.length} type{rooms.length > 1 ? "s" : ""}</span>
          <span className={totalAvail === 0 ? "text-red-600 font-medium" : "text-gray-500 dark:text-gray-400"}>{totalAvail} / {totalCap} available</span>
        </div>);
    } },
    { key: "allocations", header: tr.allocations || "Alloc", render: (_v, h) => { const allocs = (h as Hotel).allocations || []; return <span className="text-xs text-gray-600 dark:text-gray-300">{allocs.length}</span>; } },
    { key: "contact", header: tr.contact || "Contact", render: (v) => <span className="text-xs text-gray-500 dark:text-gray-400">{(v as string) || "—"}</span> },
    { key: "actions", header: tr.actions || "Actions", render: (_, h) => (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { setSelectedHotel(h as Hotel); setRoomModalOpen(true); }} title="Room types" className="p-2 text-blue-600"><EyeIcon className="w-4 h-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => { setSelectedHotel(h as Hotel); setAllocModalOpen(true); }} title="Allocate" className="p-2 text-purple-600"><TableIcon className="w-4 h-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => handleDeleteHotel(h as Hotel)} title="Delete" className="p-2 text-red-600"><TrashBinIcon className="w-4 h-4" /></Button>
      </div>) },
  ];

  if (!authLoading && !user) return null;

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageToolbar title={tr.title} description={tr.description} hideSearch actions={
        <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2"><PlusIcon className="w-4 h-4" />{tr.add}</Button>
      } />
      {loading ? (
        <div className="flex items-center justify-center p-20"><div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>
      ) : hotels.length === 0 ? (
        <EmptyState title={tr.noHotels} description={tr.description} action={{ label: tr.add, onClick: () => setIsModalOpen(true) }} />
      ) : <DataTable data={hotels} columns={columns} />}

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetHotelForm(); }} className="m-4 max-w-2xl" title={tr.add}>
        <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <Field label={`${tr.name || "Hotel name"} *`}><Input value={formName} onChange={(e) => setFormName(e.target.value)} /></Field>
          <Field label={tr.destination || "Destination"}><Input placeholder="Budva" value={formDestination} onChange={(e) => setFormDestination(e.target.value)} /></Field>
          <Field label={tr.address || "Address"}><Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} /></Field>
          <Field label={tr.contact || "Contact"}><Input value={formContact} onChange={(e) => setFormContact(e.target.value)} /></Field>
          <Field label={tr.email || "Email"}><Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></Field>
          <Field label={tr.website || "Website"}><Input type="url" placeholder="www.hotel.ba" value={formWebsite} onChange={(e) => setFormWebsite(e.target.value)} /></Field>
          <Field label={tr.stars || "Stars"}>
            <Select value={formStars} onChange={setFormStars} options={[{ value: "", label: tr.noStars || "—" }, ...starOptions]} />
          </Field>
          <Field label={tr.totalRooms || "Total rooms"}><Input type="number" value={String(formTotalRooms)} onChange={(e) => setFormTotalRooms(Number(e.target.value) || 0)} /></Field>
          <Field label={tr.amenities || "Amenities"}>
            <Input placeholder="wifi, pool, spa, gym, parking" value={formAmenities} onChange={(e) => setFormAmenities(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={tr.description || "Description"}>
              <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 sm:col-span-2 dark:border-gray-800">
            <Button variant="outline" onClick={() => { setIsModalOpen(false); resetHotelForm(); }}>{tr.cancel || "Cancel"}</Button>
            <Button onClick={() => void handleCreateHotel()} disabled={saving || !formName}>{saving ? tr.saving || "Saving…" : tr.save || "Save"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={roomModalOpen} onClose={() => setRoomModalOpen(false)} className="m-4 max-w-2xl" title={selectedHotel ? `${selectedHotel.name} — ${tr.roomTypes || "Room Types"}` : (tr.roomTypes || "Room Types")}>
        <div className="max-h-[75vh] overflow-y-auto p-6">
          <div className="mb-6 grid gap-3 sm:grid-cols-5 sm:items-end">
            <Field label={tr.roomType || "Type"}><Input placeholder="Double" value={roomType} onChange={(e) => setRoomType(e.target.value)} /></Field>
            <Field label={tr.capacity || "Capacity"}><Input type="number" value={String(roomCapacity)} onChange={(e) => setRoomCapacity(Number(e.target.value) || 1)} /></Field>
            <Field label={tr.price || "Price"}><Input type="number" value={String(roomPrice)} onChange={(e) => setRoomPrice(Number(e.target.value) || 0)} /></Field>
            <Field label={tr.currency || "Currency"}>
              <Select value={roomCurrency} onChange={setRoomCurrency} options={currencyOptions} />
            </Field>
            <Button variant="primary" onClick={() => void handleCreateRoom()} disabled={!roomType} className="h-11">{tr.add || "Add"}</Button>
          </div>
          {selectedRooms.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{tr.noRooms || "No room types yet"}</p>
          ) : (
            <div className="space-y-2">
              {selectedRooms.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{r.roomType}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Cap: {r.capacity}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{r.basePrice} {r.currency}</span>
                    <Badge size="sm" color={r.available > 0 ? "success" : "light"} className="ml-2">{r.available}/{r.total} {tr.available || "available"}</Badge>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleDeleteRoom(r.id)} className="text-red-600 p-1">✕</Button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button variant="outline" onClick={() => setRoomModalOpen(false)}>{tr.close || "Close"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={allocModalOpen} onClose={() => setAllocModalOpen(false)} className="m-4 max-w-xl" title={selectedHotel ? `${selectedHotel.name} — ${tr.allocate || "Allocate"}` : (tr.allocate || "Allocate")}>
        <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={tr.departure || "Departure"}>
              <Select value={selectedDeparture} onChange={setSelectedDeparture} options={[
                { value: "", label: tr.selectDeparture || "Select departure" },
                ...departureList.map((d: any) => ({ value: d.id, label: `${d.packageName || "Departure"} — ${new Date(d.depart_at).toLocaleDateString()}` }))
              ]} />
            </Field>
          </div>
          <Field label={tr.roomType || "Room type"}><Input placeholder="Double" value={allocRoomType} onChange={(e) => setAllocRoomType(e.target.value)} /></Field>
          <Field label={tr.roomsReserved || "Rooms reserved"}><Input type="number" value={String(allocRoomsReserved)} onChange={(e) => setAllocRoomsReserved(Number(e.target.value) || 0)} /></Field>
          <Field label={tr.checkIn || "Check-in"}><Input type="date" value={allocCheckIn} onChange={(e) => setAllocCheckIn(e.target.value)} /></Field>
          <Field label={tr.checkOut || "Check-out"}><Input type="date" value={allocCheckOut} onChange={(e) => setAllocCheckOut(e.target.value)} /></Field>
          <Field label={tr.pricePerNight || "Price/night"}>
            <Input type="number" value={String(allocPricePerNight)} onChange={(e) => setAllocPricePerNight(Number(e.target.value) || 0)} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 sm:col-span-2 dark:border-gray-800">
            <Button variant="outline" onClick={() => setAllocModalOpen(false)}>{tr.cancel || "Cancel"}</Button>
            <Button onClick={() => void handleCreateAllocation()} disabled={!selectedDeparture || !allocRoomType}>{tr.allocate || "Allocate"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
