import { type ReactNode, useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
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
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const tr = t.operations.hotels;
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestVersion = useRef(0);
  const [saving, setSaving] = useState(false);
  const hotelSaveInFlight = useRef(false);
  const roomSaveInFlight = useRef(false);
  const [roomSaving, setRoomSaving] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomReadError, setRoomReadError] = useState(false);
  const [roomReadAttempt, setRoomReadAttempt] = useState(0);
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
  const [roomQuantity, setRoomQuantity] = useState(1);
  const [roomPrice, setRoomPrice] = useState(50);
  const [roomCurrency, setRoomCurrency] = useState("BAM");

  const [allocRoomType, setAllocRoomType] = useState("");
  const [allocRoomsReserved, setAllocRoomsReserved] = useState(5);
  const [allocCheckIn, setAllocCheckIn] = useState("");
  const [allocCheckOut, setAllocCheckOut] = useState("");
  const [allocPricePerNight, setAllocPricePerNight] = useState(50);

  const fetchHotels = async () => {
    const version = ++requestVersion.current;
    setLoading(true); setLoadError(false);
    try {
      const data = await getHotels();
      if (version === requestVersion.current) setHotels(data);
    } catch {
      if (version === requestVersion.current) setLoadError(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchHotels();
    else if (!authLoading) setLoading(false);
    return () => { requestVersion.current++; };
  }, [user, authLoading]);

  useEffect(() => {
    if (loading || loadError || roomModalOpen) return;
    const hotelId = searchParams.get("hotelId");
    if (!hotelId) return;
    const hotel = hotels.find((item) => item.id === hotelId);
    if (!hotel) return;
    setSelectedHotel(hotel);
    setRoomLoading(true); setRoomModalOpen(true);
  }, [loading, loadError, roomModalOpen, searchParams, hotels]);

  useEffect(() => {
    if (!roomModalOpen || !selectedHotel) return;
    let cancelled = false;
    setRoomLoading(true); setRoomReadError(false);
    getHotelRooms(selectedHotel.id).then(rows => {
      if (!cancelled) setSelectedRooms(rows);
    }).catch(() => { if (!cancelled) setRoomReadError(true); })
      .finally(() => { if (!cancelled) setRoomLoading(false); });
    // Existing departure-choice behavior is retained for the separate allocation workflow.
    getDepartures({ limit: 200 }).then(r => { if (!cancelled) setDepartureList(r.data || []); })
      .catch(() => { if (!cancelled) setDepartureList([]); });
    return () => { cancelled = true; };
  }, [roomModalOpen, selectedHotel, roomReadAttempt]);

  useEffect(() => {
    setRoomType(""); setRoomQuantity(1); setRoomCapacity(2); setRoomPrice(50);
  }, [selectedHotel?.id]);

  const inventoryFailure = (error: any, fallback: string) => {
    const code = error?.response?.data?.code || error?.code;
    const messages: Record<string,string> = { MIGRATION_PENDING: tr.inventoryUpdateRequired,
      VALIDATION_ERROR: tr.invalidInventory, CONFLICT: tr.stockConflict };
    return messages[code] || fallback;
  };

  const resetHotelForm = () => {
    setFormName(""); setFormDestination(""); setFormAddress(""); setFormContact("");
    setFormTotalRooms(10); setFormStars(""); setFormDescription(""); setFormAmenities("");
    setFormEmail(""); setFormWebsite("");
  };

  const handleCreateHotel = async () => {
    if (hotelSaveInFlight.current) return;
    hotelSaveInFlight.current = true;
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
      showSuccess(tr.hotelSaved);
      resetHotelForm(); setIsModalOpen(false); fetchHotels();
    } catch (err: any) { showError(inventoryFailure(err, tr.hotelSaveError)); }
    finally { hotelSaveInFlight.current = false; setSaving(false); }
  };

  const handleDeleteHotel = async (h: Hotel) => {
    if (!confirm(`Delete hotel ${h.name}?`)) return;
    try { await deleteHotel(h.id); showSuccess("Hotel deleted"); fetchHotels(); }
    catch (err: any) { showError(err.message || "Failed to delete hotel"); }
  };

  const handleCreateRoom = async () => {
    if (!selectedHotel || roomLoading || roomReadError || roomSaveInFlight.current) return;
    roomSaveInFlight.current = true; setRoomSaving(true);
    try {
      await createHotelRoom(selectedHotel.id, { roomType, capacity: roomCapacity, quantity: roomQuantity, basePrice: roomPrice, currency: roomCurrency });
      showSuccess(tr.roomSaved); setRoomType(""); setRoomQuantity(1); closeRoomModal(); fetchHotels();
    } catch (err: any) { showError(inventoryFailure(err, tr.roomSaveError)); }
    finally { roomSaveInFlight.current = false; setRoomSaving(false); }
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

  const closeRoomModal = () => {
    setRoomModalOpen(false);
    if (searchParams.get("hotelId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("hotelId");
      setSearchParams(next, { replace: true });
    }
  };

  const handleCloseRoomModal = () => {
    if (!roomSaveInFlight.current) closeRoomModal();
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
        <Button size="sm" variant="outline" onClick={() => navigate(`/operations/hotels/${(h as Hotel).id}`)} className="p-2">{tr.open || "Open"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setSelectedHotel(h as Hotel); setRoomLoading(true); setRoomModalOpen(true); }} title="Room types" className="p-2 text-blue-600"><EyeIcon className="w-4 h-4" /></Button>
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
      ) : loadError ? (
        <div className="p-6"><p role="alert" className="mb-4 text-gray-900 dark:text-white">{tr.loadError}</p><Button onClick={fetchHotels}>{tr.retryLoad}</Button></div>
      ) : hotels.length === 0 ? (
        <EmptyState title={tr.noHotels} description={tr.description} action={{ label: tr.add, onClick: () => setIsModalOpen(true) }} />
      ) : <DataTable data={hotels} columns={columns} />}

      <Modal isOpen={isModalOpen} onClose={() => { if (!hotelSaveInFlight.current) { setIsModalOpen(false); resetHotelForm(); } }} className="m-4 max-w-2xl" title={tr.add}>
        <fieldset disabled={saving}>
        <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <Field label={`${tr.name || "Hotel name"} *`} htmlFor="hotel-name"><Input id="hotel-name" value={formName} onChange={(e) => setFormName(e.target.value)} /></Field>
          <Field label={tr.destination || "Destination"} htmlFor="hotel-destination"><Input id="hotel-destination" placeholder="Budva" value={formDestination} onChange={(e) => setFormDestination(e.target.value)} /></Field>
          <Field label={tr.address || "Address"}><Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} /></Field>
          <Field label={tr.contact || "Contact"}><Input value={formContact} onChange={(e) => setFormContact(e.target.value)} /></Field>
          <Field label={tr.email || "Email"}><Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></Field>
          <Field label={tr.website || "Website"}><Input type="url" placeholder="www.hotel.ba" value={formWebsite} onChange={(e) => setFormWebsite(e.target.value)} /></Field>
          <Field label={tr.stars || "Stars"}>
            <Select value={formStars} onChange={setFormStars} options={[{ value: "", label: tr.noStars || "—" }, ...starOptions]} />
          </Field>
          <Field label={tr.totalRooms || "Total rooms"} htmlFor="hotel-total-rooms"><Input id="hotel-total-rooms" hint={tr.initialStockHint} type="number" value={String(formTotalRooms)} onChange={(e) => setFormTotalRooms(Number(e.target.value) || 0)} /></Field>
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
            <Button variant="outline" onClick={() => { setIsModalOpen(false); resetHotelForm(); }}>{t.common.cancel}</Button>
            <Button onClick={() => void handleCreateHotel()} disabled={saving || !formName.trim() || !formDestination.trim()}>{saving ? t.common.saving : t.common.save}</Button>
          </div>
        </div>
        </fieldset>
      </Modal>

      <Modal isOpen={roomModalOpen} onClose={handleCloseRoomModal} className="m-4 max-w-2xl" title={selectedHotel ? `${selectedHotel.name} — ${tr.roomTypes || "Room Types"}` : (tr.roomTypes || "Room Types")}>
        <fieldset disabled={roomSaving}>
        <div className="max-h-[75vh] overflow-y-auto p-6">
          <div className="mb-6 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label={tr.type} htmlFor="hotel-room-type"><Input id="hotel-room-type" placeholder={tr.roomTypeExample} value={roomType} onChange={(e) => setRoomType(e.target.value)} /></Field>
            <Field label={tr.capacity || "Capacity"} htmlFor="hotel-room-capacity"><Input id="hotel-room-capacity" type="number" value={String(roomCapacity)} onChange={(e) => setRoomCapacity(Number(e.target.value) || 1)} /></Field>
            <Field label={tr.roomQuantity} htmlFor="hotel-room-quantity"><Input id="hotel-room-quantity" type="number" min="0" step={1} hint={tr.roomQuantityHint} value={String(roomQuantity)} onChange={e => setRoomQuantity(Number(e.target.value))} /></Field>
            <Field label={tr.price} htmlFor="hotel-room-price"><Input id="hotel-room-price" type="number" min={0} step={0.01} value={String(roomPrice)} onChange={(e) => setRoomPrice(Number(e.target.value) || 0)} /></Field>
            <Field label={tr.currency || "Currency"}>
              <Select value={roomCurrency} onChange={setRoomCurrency} options={currencyOptions} />
            </Field>
            <Button variant="primary" onClick={() => void handleCreateRoom()} disabled={roomSaving || roomLoading || roomReadError || !roomType.trim()} className="h-11">{roomSaving ? t.common.saving : tr.addRoom}</Button>
          </div>
          {roomLoading ? <p className="py-4 text-gray-500 dark:text-gray-400">{t.common.loading}</p> : roomReadError ? (
            <div><p role="alert" className="mb-3 text-gray-900 dark:text-white">{tr.roomLoadError}</p><Button onClick={() => setRoomReadAttempt(value => value + 1)}>{tr.retryRooms}</Button></div>
          ) : selectedRooms.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{tr.noRooms || "No room types yet"}</p>
          ) : (
            <div className="space-y-2">
              {selectedRooms.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{r.roomType}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{tr.capacity}: {r.capacity}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{r.basePrice} {r.currency}</span>
                    <Badge size="sm" color={r.available > 0 ? "success" : "light"} className="ml-2">{r.available}/{r.total} {tr.available || "available"}</Badge>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleDeleteRoom(r.id)} className="text-red-600 p-1">✕</Button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button variant="outline" onClick={handleCloseRoomModal}>{t.common.close}</Button>
          </div>
        </div>
        </fieldset>
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
          <Field label={tr.roomType || "Room type"}><Input placeholder="e.g. 2-bed, 3-bed, twin, family" value={allocRoomType} onChange={(e) => setAllocRoomType(e.target.value)} /></Field>
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

function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return <div><Label htmlFor={htmlFor}>{label}</Label><div className="mt-1.5">{children}</div></div>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
