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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
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
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
