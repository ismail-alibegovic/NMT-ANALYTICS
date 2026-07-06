import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
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

export default function Hotels() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const tr = t.operations.hotels;
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [selectedRooms, setSelectedRooms] = useState<HotelRoom[]>([]);
  const [selectedDeparture, setSelectedDeparture] = useState("");
  const [departureList, setDepartureList] = useState<Departure[]>([]);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDestination, setFormDestination] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formTotalRooms, setFormTotalRooms] = useState(10);

  // Room form
  const [roomType, setRoomType] = useState("");
  const [roomCapacity, setRoomCapacity] = useState(2);
  const [roomPrice, setRoomPrice] = useState(50);
  const [roomCurrency, setRoomCurrency] = useState("BAM");

  // Allocation form
  const [allocRoomType, setAllocRoomType] = useState("");
  const [allocRoomsReserved, setAllocRoomsReserved] = useState(5);
  const [allocCheckIn, setAllocCheckIn] = useState("");
  const [allocCheckOut, setAllocCheckOut] = useState("");
  const [allocPricePerNight, setAllocPricePerNight] = useState(50);

  const fetchHotels = async () => {
    setLoading(true);
    try {
      const data = await getHotels();
      setHotels(data);
      setLoading(false);
    } catch (err: any) {
      showError(err.message || "Failed to load hotels");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchHotels();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  useEffect(() => {
    if (roomModalOpen && selectedHotel) {
      getHotelRooms(selectedHotel.id).then(setSelectedRooms).catch(() => setSelectedRooms([]));
      // Load departures for allocation selector
      getDepartures({ limit: 200 })
        .then((r) => setDepartureList(r.data || []))
        .catch(() => setDepartureList([]));
    }
  }, [roomModalOpen, selectedHotel]);

  const handleCreateHotel = async () => {
    try {
      await createHotel({
        name: formName,
        destination: formDestination,
        address: formAddress || undefined,
        contact: formContact || undefined,
        totalRooms: formTotalRooms,
      });
      showSuccess("Hotel created");
      setIsModalOpen(false);
      fetchHotels();
    } catch (err: any) {
      showError(err.message || "Failed to create hotel");
    }
  };

  const handleDeleteHotel = async (h: Hotel) => {
    if (!confirm(`Delete hotel ${h.name}?`)) return;
    try {
      await deleteHotel(h.id);
      showSuccess("Hotel deleted");
      fetchHotels();
    } catch (err: any) {
      showError(err.message || "Failed to delete hotel");
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedHotel) return;
    try {
      await createHotelRoom(selectedHotel.id, {
        roomType, capacity: roomCapacity, basePrice: roomPrice, currency: roomCurrency,
      });
      showSuccess("Room type added");
      setRoomModalOpen(false);
      fetchHotels();
    } catch (err: any) {
      showError(err.message || "Failed to add room");
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    try {
      await deleteHotelRoom(roomId);
      showSuccess("Room deleted");
      fetchHotels();
    } catch (err: any) {
      showError(err.message || "Failed to delete room");
    }
  };

  const handleCreateAllocation = async () => {
    if (!selectedHotel || !selectedDeparture) return;
    try {
      await createHotelAllocation(selectedDeparture, {
        hotelId: selectedHotel.id,
        roomType: allocRoomType,
        roomsReserved: allocRoomsReserved,
        checkIn: allocCheckIn,
        checkOut: allocCheckOut,
        pricePerNight: allocPricePerNight,
      });
      showSuccess("Allocation created");
      setAllocModalOpen(false);
      fetchHotels();
    } catch (err: any) {
      showError(err.message || "Failed to create allocation");
    }
  };

  const openRooms = (h: Hotel) => { setSelectedHotel(h); setRoomModalOpen(true); };
  const openAlloc = (h: Hotel) => { setSelectedHotel(h); setAllocModalOpen(true); };

  const columns: Column<Hotel>[] = [
    {
      key: "name",
      header: "Hotel",
      render: (v, h) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-white">{v as string}</span>
          {(h as Hotel).address && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{(h as Hotel).address}</span>
          )}
        </div>
      ),
    },
    {
      key: "destination",
      header: "Destination",
      render: (v) => <span className="text-gray-600 dark:text-gray-300">{v as string}</span>,
    },
    {
      key: "rooms",
      header: "Room Types",
      render: (_v, h) => {
        const rooms = (h as Hotel).rooms || [];
        const totalAvail = rooms.reduce((s, r) => s + (r.available || 0), 0);
        const totalCap = rooms.reduce((s, r) => s + (r.total || 0), 0);
        if (rooms.length === 0) return <span className="text-xs text-gray-400">—</span>;
        return (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-gray-700 dark:text-gray-300">{rooms.length} type{rooms.length > 1 ? "s" : ""}</span>
            <span className={totalAvail === 0 ? "text-red-600 font-medium" : "text-gray-500 dark:text-gray-400"}>
              {totalAvail} / {totalCap} available
            </span>
          </div>
        );
      },
    },
    {
      key: "allocations",
      header: "Alloc",
      render: (_v, h) => {
        const allocs = (h as Hotel).allocations || [];
        return <span className="text-xs text-gray-600 dark:text-gray-300">{allocs.length}</span>;
      },
    },
    { key: "contact", header: "Contact", render: (v) => <span className="text-xs text-gray-500 dark:text-gray-400">{(v as string) || "—"}</span> },
    {
      key: "actions", header: "Actions",
      render: (_, h) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openRooms(h as Hotel)} title="Room types" className="p-2 text-blue-600">
            <EyeIcon className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => openAlloc(h as Hotel)} title="Allocate" className="p-2 text-purple-600">
            <TableIcon className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleDeleteHotel(h as Hotel)} title="Delete" className="p-2 text-red-600">
            <TrashBinIcon className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!authLoading && !user) return null;

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={tr.description}
        hideSearch
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> {tr.add}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : hotels.length === 0 ? (
        <EmptyState title={tr.noHotels} description={tr.description} action={{ label: tr.add, onClick: () => setIsModalOpen(true) }} />
      ) : (
        <DataTable data={hotels} columns={columns} />
      )}

      {/* Create Hotel Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md">
        <div className="space-y-4">
          <input placeholder="Hotel name" value={formName} onChange={e => setFormName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input placeholder="Destination (e.g. Budva)" value={formDestination} onChange={e => setFormDestination(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input placeholder="Address" value={formAddress} onChange={e => setFormAddress(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input placeholder="Contact" value={formContact} onChange={e => setFormContact(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="number" placeholder="Total rooms" value={formTotalRooms} onChange={e => setFormTotalRooms(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateHotel}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Room Manager Modal */}
      <Modal isOpen={roomModalOpen} onClose={() => setRoomModalOpen(false)} className="max-w-2xl">
        <div className="space-y-4">
          {selectedHotel && <h3 className="font-bold text-lg">{selectedHotel.name} — Room Types</h3>}
          <div className="flex gap-2">
            <input placeholder="Type (e.g. Double)" value={roomType} onChange={e => setRoomType(e.target.value)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <input type="number" placeholder="Capacity" value={roomCapacity} onChange={e => setRoomCapacity(+e.target.value)} className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <input type="number" placeholder="Price" value={roomPrice} onChange={e => setRoomPrice(+e.target.value)} className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <select value={roomCurrency} onChange={e => setRoomCurrency(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
              <option>BAM</option><option>EUR</option><option>USD</option>
            </select>
            <Button size="sm" variant="primary" onClick={handleCreateRoom}>Add</Button>
          </div>
          {selectedRooms.map(r => (
            <div key={r.id} className="flex items-center justify-between border-b py-2">
              <span className="text-sm">{r.roomType} · Cap: {r.capacity} · {r.basePrice} {r.currency} · Avail: {r.available}/{r.total}</span>
              <Button size="sm" variant="outline" onClick={() => handleDeleteRoom(r.id)} className="text-red-600 p-1">✕</Button>
            </div>
          ))}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setRoomModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Allocation Modal */}
      <Modal isOpen={allocModalOpen} onClose={() => setAllocModalOpen(false)} className="max-w-md">
        <div className="space-y-4">
          {selectedHotel && <h3 className="font-bold text-lg">{selectedHotel.name} — Allocate</h3>}
          <select value={selectedDeparture} onChange={e => setSelectedDeparture(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
            <option value="">Select departure</option>
            {departureList.map((d: any) => (
              <option key={d.id} value={d.id}>{d.packageName || 'Departure'} — {new Date(d.depart_at).toLocaleDateString()}</option>
            ))}
          </select>
          <input placeholder="Room type" value={allocRoomType} onChange={e => setAllocRoomType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="number" placeholder="Rooms reserved" value={allocRoomsReserved} onChange={e => setAllocRoomsReserved(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="date" value={allocCheckIn} onChange={e => setAllocCheckIn(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="date" value={allocCheckOut} onChange={e => setAllocCheckOut(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="number" placeholder="Price per night" value={allocPricePerNight} onChange={e => setAllocPricePerNight(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAllocModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateAllocation}>Allocate</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}