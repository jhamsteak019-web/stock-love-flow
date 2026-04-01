import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PresenceTracker } from "@/components/PresenceTracker";

const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[60vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const AuthPage = lazy(() => import("./pages/AuthPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const ReleaseStock = lazy(() => import("./pages/ReleaseStock"));
const Deliveries = lazy(() => import("./pages/Deliveries"));
const History = lazy(() => import("./pages/History"));
const ImportExcel = lazy(() => import("./pages/ImportExcel"));
const ManageUsers = lazy(() => import("./pages/ManageUsers"));
const SummaryReport = lazy(() => import("./pages/SummaryReport"));
const Notes = lazy(() => import("./pages/Notes"));
const CollectionItems = lazy(() => import("./pages/CollectionItems"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Container = lazy(() => import("./pages/Container"));
const RepeatOrder = lazy(() => import("./pages/RepeatOrder"));
const Allocation = lazy(() => import("./pages/Allocation"));
const TaskCalendar = lazy(() => import("./pages/TaskCalendar"));
const Attendance = lazy(() => import("./pages/Attendance"));
const ResumeToWork = lazy(() => import("./pages/ResumeToWork"));
const Manpower = lazy(() => import("./pages/Manpower"));
const Renewal = lazy(() => import("./pages/Renewal"));
const StoreVisitSchedule = lazy(() => import("./pages/StoreVisitSchedule"));
const ActivityHistory = lazy(() => import("./pages/ActivityHistory"));
const Reports = lazy(() => import("./pages/Reports"));
const DamageClaims = lazy(() => import("./pages/DamageClaims"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BranchProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route element={<><PresenceTracker /><DashboardLayout /></>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/release" element={<ReleaseStock />} />
                  <Route path="/deliveries" element={<Deliveries />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/summary" element={<SummaryReport />} />
                  <Route path="/import" element={<ImportExcel />} />
                  <Route path="/users" element={<ManageUsers />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/collections" element={<CollectionItems />} />
                  <Route path="/favorites" element={<Favorites />} />
                  <Route path="/container" element={<Container />} />
                  <Route path="/repeat-order" element={<RepeatOrder />} />
                  <Route path="/allocation" element={<Allocation />} />
                  <Route path="/task-calendar" element={<TaskCalendar />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/resume-to-work" element={<ResumeToWork />} />
                  <Route path="/manpower" element={<Manpower />} />
                  <Route path="/renewal" element={<Renewal />} />
                  <Route path="/store-visit-schedule" element={<StoreVisitSchedule />} />
                  <Route path="/activity-history" element={<ActivityHistory />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/damage-claims" element={<DamageClaims />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
