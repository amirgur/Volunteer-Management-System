// React and Router
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// Internationalization
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";

// Icons
import { Menu, MapPin, Clock, CalendarDays, Search } from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Custom Components
import ManagerSidebar from "@/components/manager/ManagerSidebar";

// Utilities and Helpers
import { cn } from "@/lib/utils";

// Firebase
import { onSnapshot, query, where, limit, Timestamp } from "firebase/firestore";
import { attendanceRef } from "@/services/firestore";

// Hooks
import { useVolunteers } from "@/hooks/useFirestoreVolunteers";

const MOBILE_BREAKPOINT = 1024;

type ViewMode = "active" | "date";

type FacilityAttendanceRecord = {
  id: string;
  attendanceType?: string;
  appointmentId?: string | null;
  date?: string;
  volunteerId?: { id: string; type: "volunteer" | "external_group" } | { id: string; type: string };
  status?: string;
  confirmedBy?: string;
  confirmedAt?: Timestamp;
  visitStartedAt?: Timestamp | null;
  visitEndedAt?: Timestamp | null;
  notes?: string | null;
};

const formatTime = (ts: any, locale: string) => {
  if (!ts) return "";
  try {
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const diffMinutes = (startTs: any, endTs: any) => {
  if (!startTs || !endTs) return null;
  try {
    const start = startTs.toDate ? startTs.toDate() : new Date(startTs);
    const end = endTs.toDate ? endTs.toDate() : new Date(endTs);
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  } catch {
    return null;
  }
};

const getTodayStr = () => new Date().toISOString().split("T")[0];

export default function FacilityAttendance() {
  const navigate = useNavigate();
  const { t } = useTranslation("manager-facility-attendance");
  const { isRTL, language } = useLanguage();
  const { t: tNav } = useTranslation("navigation");

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);

  const [mode, setMode] = useState<ViewMode>("active");
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<FacilityAttendanceRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { volunteers } = useVolunteers();

  // Auth guard (same pattern as other manager pages)
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

  // Subscribe to facility attendance records
  useEffect(() => {
    setLoading(true);
    setLoadError(null);

    // Intentionally keep this query "simple" (single where) to avoid composite index requirements.
    // We filter/sort client-side based on mode/date.
    const q = query(attendanceRef, where("attendanceType", "==", "facility"), limit(500));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FacilityAttendanceRecord[];
        setRecords(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading facility attendance:", error);
        // Keep whatever data we already have, but show the error so it isn't "mysteriously empty".
        setLoadError(error?.message || String(error));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const volunteerNameById = useMemo(() => {
    const m = new Map<string, string>();
    volunteers.forEach((v) => m.set(v.id, v.fullName || v.id));
    return m;
  }, [volunteers]);

  const rows = useMemo(() => {
    const locale = language === "he" ? "he-IL" : "en-US";
    const q = search.trim().toLowerCase();

    const filteredByMode = records.filter((r) => {
      const isActive = !r.visitEndedAt;
      if (mode === "active") return isActive;
      return (r.date || "") === selectedDate;
    });

    // Sort newest first (confirmedAt desc) to mimic the previous query orderBy
    filteredByMode.sort((a: any, b: any) => {
      const aTs = a.confirmedAt?.toDate?.() ? a.confirmedAt.toDate().getTime() : 0;
      const bTs = b.confirmedAt?.toDate?.() ? b.confirmedAt.toDate().getTime() : 0;
      return bTs - aTs;
    });

    return filteredByMode
      .map((r) => {
        const volId = (r.volunteerId as any)?.id;
        const name = volId ? (volunteerNameById.get(volId) || volId) : t("unknownVolunteer");
        const startTs = r.visitStartedAt || r.confirmedAt;
        const endTs = r.visitEndedAt;
        const mins = diffMinutes(startTs, endTs);

        return {
          id: r.id,
          volunteerId: volId,
          volunteerName: name,
          date: r.date || "",
          checkIn: formatTime(startTs, locale),
          checkOut: endTs ? formatTime(endTs, locale) : "",
          durationMinutes: mins,
          isActive: !endTs,
          notes: r.notes || "",
          status: r.status || "",
        };
      })
      .filter((r) => {
        if (!q) return true;
        return (r.volunteerName || "").toLowerCase().includes(q) || (r.volunteerId || "").toLowerCase().includes(q);
      });
  }, [records, volunteerNameById, language, search, t, mode, selectedDate]);

  const onLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    navigate("/login");
  };

  return (
    <div className={cn("flex min-h-screen bg-slate-50", isRTL && "rtl")}>
      <ManagerSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isMobile={isMobile}
        onLogout={onLogout}
      />

      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className={cn("bg-white border-b px-4 py-3 flex items-center justify-between", isRTL && "flex-row-reverse")}>
          <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5 text-slate-600" />
                {tNav("facilityAttendance")}
              </h1>
              <p className="text-sm text-slate-500">{t("subtitle")}</p>
            </div>
          </div>
        </header>

        <main className="p-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-600" />
                {t("title")}
              </CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {loadError && (
                <div className="border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-sm">
                  {t("loadError")}: {loadError}
                </div>
              )}
              <div className={cn("flex items-center gap-3 flex-wrap", isRTL && "flex-row-reverse")}>
                <Tabs value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
                  <TabsList>
                    <TabsTrigger value="active">{t("tabs.active")}</TabsTrigger>
                    <TabsTrigger value="date">{t("tabs.byDate")}</TabsTrigger>
                  </TabsList>
                </Tabs>

                {mode === "date" && (
                  <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-[180px]"
                    />
                  </div>
                )}

                <div className={cn("flex items-center gap-2 flex-1 min-w-[240px]", isRTL && "flex-row-reverse")}>
                  <Search className="h-4 w-4 text-slate-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                  />
                </div>

                <Badge variant="secondary">
                  {t("count", { count: rows.length })}
                </Badge>
              </div>

              <div className="border rounded-md bg-white overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.volunteer")}</TableHead>
                      <TableHead>{t("table.checkIn")}</TableHead>
                      <TableHead>{t("table.checkOut")}</TableHead>
                      <TableHead>{t("table.duration")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.notes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                          {t("loading")}
                        </TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                          {mode === "active" ? t("empty.active") : t("empty.byDate")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.volunteerName}</TableCell>
                          <TableCell>{r.checkIn}</TableCell>
                          <TableCell>{r.checkOut || <span className="text-slate-400">—</span>}</TableCell>
                          <TableCell>
                            {r.durationMinutes == null ? <span className="text-slate-400">—</span> : t("minutes", { count: r.durationMinutes })}
                          </TableCell>
                          <TableCell>
                            {r.isActive ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{t("badges.active")}</Badge>
                            ) : (
                              <Badge variant="secondary">{t("badges.completed")}</Badge>
                            )}
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


