import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PresenceTracker } from "@/components/PresenceTracker";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import ReleaseStock from "./pages/ReleaseStock";
import Deliveries from "./pages/Deliveries";
import History from "./pages/History";
import ImportExcel from "./pages/ImportExcel";
import ManageUsers from "./pages/ManageUsers";
import SummaryReport from "./pages/SummaryReport";
import Notes from "./pages/Notes";
import CollectionItems from "./pages/CollectionItems";
import Favorites from "./pages/Favorites";
import Container from "./pages/Container";
import RepeatOrder from "./pages/RepeatOrder";
import Allocation from "./pages/Allocation";
import TaskCalendar from "./pages/TaskCalendar";
import Attendance from "./pages/Attendance";
import ResumeToWork from "./pages/ResumeToWork";
import Manpower from "./pages/Manpower";
import Renewal from "./pages/Renewal";
import StoreVisitSchedule from "./pages/StoreVisitSchedule";
import Reports from "./pages/Reports";
import DamageClaims from "./pages/DamageClaims";
import Discrepancies from "./pages/Discrepancies";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import TeamOverview from "./pages/TeamOverview";
import PendingAllocation from "./pages/PendingAllocation";
import NotFound from "./pages/NotFound";
import Maintenance from "./pages/Maintenance";

// Set to false to bring the app back online.
const MAINTENANCE_MODE = true;


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
      {MAINTENANCE_MODE ? (
        <Maintenance />
      ) : (
      <BrowserRouter>
        <AuthProvider>
          <BranchProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route element={<><PresenceTracker /><DashboardLayout /></>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/release" element={<ReleaseStock />} />
                <Route path="/deliveries" element={<Deliveries />} />
                <Route path="/pending-allocation" element={<PendingAllocation />} />
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
                <Route path="/reports" element={<Reports />} />
                <Route path="/damage-claims" element={<DamageClaims />} />
                <Route path="/discrepancies" element={<Discrepancies />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/team-overview" element={<TeamOverview />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
      )}
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
