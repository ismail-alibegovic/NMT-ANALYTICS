import { useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import { Departure } from "../../api/departures";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    departure: Departure;
  };
}

interface Props {
  departures: Departure[];
  loading: boolean;
}

function getEventColor(departure: Departure): { bg: string; border: string; text: string } {
  const occupancy = departure.capacity > 0 ? departure.booked / departure.capacity : 0;
  if (departure.status === "cancelled") return { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" };
  if (departure.status === "completed") return { bg: "#f0f9ff", border: "#3b82f6", text: "#1e40af" };
  if (occupancy >= 0.8) return { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" };
  if (occupancy >= 0.5) return { bg: "#fefce8", border: "#eab308", text: "#854d0e" };
  return { bg: "#f0fdf4", border: "#22c55e", text: "#166534" };
}

function formatEventTitle(departure: Departure): string {
  const occ = departure.capacity > 0 ? Math.round((departure.booked / departure.capacity) * 100) : 0;
  return `${departure.packageName || '-'} (${departure.booked}/${departure.capacity} - ${occ}%)`;
}

export default function DepartureCalendarView({ departures, loading }: Props) {
  const calendarRef = useRef<FullCalendar>(null);

  const events: CalendarEvent[] = departures.map(d => {
    const colors = getEventColor(d);
    return {
      id: d.id,
      title: formatEventTitle(d),
      start: d.depart_at,
      end: d.return_at,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      extendedProps: { departure: d },
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,listWeek",
        }}
        events={events}
        height="auto"
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        firstDay={1}
        locale="bs"
        buttonText={{
          today: "Danas",
          month: "Mjesec",
          week: "Sedmica",
          list: "Lista",
        }}
        eventTimeFormat={{
          hour: "2-digit",
          minute: "2-digit",
        }}
        dayMaxEvents={3}
        moreLinkText={(num) => `+${num} više`}
        noEventsText="Nema polazaka u ovom periodu"
      />
    </div>
  );
}
