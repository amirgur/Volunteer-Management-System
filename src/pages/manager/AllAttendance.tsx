// React and Router
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// Internationalization
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";

// Icons
import { Menu, ListChecks, Search, CalendarDays } from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Custom Components
import ManagerSidebar from "@/components/manager/ManagerSidebar";

// Utilities and Helpers
import { cn } from "@/lib/utils";

// Firebase
import { getDocs } from "firebase/firestore";
import { calendar_slotsRef, docToObject } from "@/services/firestore";

// Hooks
import { useAttendance } from "@/hooks/useAttendance";
import { useVolunteers } from "@/hooks/useFirestoreVolunteers";

const MOBILE_BREAKPOINT = 1024;

type AttendanceFilter = "all" | "appointment" | "facility";

type CalendarSlotLite = {
  id: string;
  appointmentId?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  isCustom?: boolean;
  customLabel?: string | null;
  sessionCategory?: string | null;
};

const getTodayStr = () => new Date().toISOString().split("T")[0];

const toLocale = (lang: string) => (lang === "he" ? "he-IL" : "en-US");

const formatTimeFromIso = (iso: string, locale: string) => {
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export default function AllAttendance() {
  const navigate = useNavigate();
  const { isRTL, language } = useLanguage();
  const { t } = useTranslation("manager-all-attendance");
  const { t: tNav } = useTranslation("navigation");

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);

  const [filter, setFilter] = useState<AttendanceFilter>("all");
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [search, setSearch] = useState("");

  const [slotsByAppointmentId, setSlotsByAppointmentId] = useState<Record<string, CalendarSlotLite>>({});
  const [slotsLoaded, setSlotsLoaded] = useState(false);

  const { attendance, loading: attendanceLoading, error: attendanceError } = useAttendance();
  const { volunteers } = useVolunteers();

  // Auth guard
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || sessionStorage.getItem("user") || "{}");
    if (!user.id || user.role !== "manager") {
      navigate("/login");
    }
  }, [navigate]);

  // Responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      setIsSidebarOpen(!mobile);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load calendar slots once for appointment enrichment (client-side join)
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(calendar_slotsRef);
        const map: Record<string, CalendarSlotLite> = {};
        snap.docs.forEach((d) => {
          const s = docToObject<CalendarSlotLite>(d);
          const appointmentId = (s.appointmentId || d.id) as string;
          if (appointmentId) map[appointmentId] = { ...s, id: d.id };
        });
        setSlotsByAppointmentId(map);
      } catch (e) {
        console.error("Failed loading calendar slots for attendance enrichment:", e);
        setSlotsByAppointmentId({});
      } finally {
        setSlotsLoaded(true);
      }
    };
    load();
  }, []);

  const volunteerNameById = useMemo(() => {
    const m = new Map<string, string>();
    volunteers.forEach((v) => m.set(v.id, v.fullName || v.id));
    return m;
  }, [volunteers]);

  const rows = useMemo(() => {
    const locale = toLocale(language);
    const q = search.trim().toLowerCase();

    const normalized = attendance.map((r) => {
      const isFacility = r.attendanceType === "facility" || !r.appointmentId;
      const type: AttendanceFilter = isFacility ? "facility" : "appointment";

      const volunteerId = (r as any).volunteerId?.id || (r as any).volunteerId;
      const volunteerName = volunteerId ? (volunteerNameById.get(volunteerId) || volunteerId) : t("unknownVolunteer");

      const confirmedIso = r.confirmedAt;
      const date = isFacility
        ? ((r as any).date || confirmedIso.split("T")[0] || "")
        : (slotsByAppointmentId[String(r.appointmentId)]?.date || "");

      const slot = !isFacility && r.appointmentId ? slotsByAppointmentId[String(r.appointmentId)] : undefined;
      const sessionTitle = slot?.isCustom && slot.customLabel
        ? slot.customLabel
        : (slot?.sessionCategory ? t(`categories.${slot.sessionCategory}`) : "");

      const timeText = isFacility
        ? formatTimeFromIso(confirmedIso, locale)
        : (slot?.startTime && slot?.endTime ? `${slot.startTime} - ${slot.endTime}` : "");

      return {
        id: r.id,
        type,
        status: r.status,
        volunteerId,
        volunteerName,
        date,
        time: timeText,
        sessionTitle,
        appointmentId: r.appointmentId || null,
        notes: r.notes || "",
        confirmedAt: confirmedIso,
      };
    });

    const filtered = normalized
      .filter((r) => (filter === "all" ? true : r.type === filter))
      .filter((r) => (selectedDate ? r.date === selectedDate : true))
      .filter((r) => {
        if (!q) return true;
        return (r.volunteerName || "").toLowerCase().includes(q) || (r.volunteerId || "").toLowerCase().includes(q);
      });

    filtered.sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1));
    return filtered;
  }, [attendance, filter, language, search, selectedDate, slotsByAppointmentId, t, volunteerNameById]);

  const onLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    navigate("/login");
  };

  const showLoading = attendanceLoading || !slotsLoaded;

  return (
    <div className={cn("flex min-h-screen bg-slate-50", isRTL && "rtl")}>
      <ManagerSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isMobile={isMobile}
        onLogout={onLogout}
      />

      <div className="flex-1 flex flex-col">
        <header className={cn("bg-white border-b px-4 py-3 flex items-center justify-between", isRTL && "flex-row-reverse")}>
          <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-slate-600" />
                {tNav("allAttendance")}
              </h1>
              <p className="text-sm text-slate-500">{t("subtitle")}</p>
            </div>
          </div>
        </header>

        <main className="p-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {attendanceError && (
                <div className="border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-sm">
                  {t("loadError")}: {attendanceError.message}
                </div>
              )}

              <div className={cn("flex items-center gap-3 flex-wrap", isRTL && "flex-row-reverse")}>
                <Tabs value={filter} onValueChange={(v) => setFilter(v as AttendanceFilter)}>
                  <TabsList>
                    <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
                    <TabsTrigger value="appointment">{t("tabs.appointment")}</TabsTrigger>
                    <TabsTrigger value="facility">{t("tabs.facility")}</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-[180px]"
                  />
                </div>

                <div className={cn("flex items-center gap-2 flex-1 min-w-[240px]", isRTL && "flex-row-reverse")}>
                  <Search className="h-4 w-4 text-slate-500" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
                </div>

                <Badge variant="secondary">{t("count", { count: rows.length })}</Badge>
              </div>

              <div className="border rounded-md bg-white overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.type")}</TableHead>
                      <TableHead>{t("table.volunteer")}</TableHead>
                      <TableHead>{t("table.date")}</TableHead>
                      <TableHead>{t("table.time")}</TableHead>
                      <TableHead>{t("table.session")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.notes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                          {t("loading")}
                        </TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                          {t("empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            {r.type === "facility" ? (
                              <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">{t("badges.facility")}</Badge>
                            ) : (
                              <Badge variant="secondary">{t("badges.appointment")}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{r.volunteerName}</TableCell>
                          <TableCell>{r.date || <span className="text-slate-400">—</span>}</TableCell>
                          <TableCell>{r.time || <span className="text-slate-400">—</span>}</TableCell>
                          <TableCell className="max-w-[240px] truncate">{r.sessionTitle || (r.appointmentId ? String(r.appointmentId) : <span className="text-slate-400">—</span>)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.status}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[420px] truncate">{r.notes || <span className="text-slate-400">—</span>}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}


