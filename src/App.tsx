import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
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
import NotFound from "./pages/NotFound";
import StorePortal from "./pages/StorePortal";
import ManageStoreTokens from "./pages/ManageStoreTokens";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PresenceTracker />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/release" element={<ReleaseStock />} />
              <Route path="/deliveries" element={<Deliveries />} />
              <Route path="/history" element={<History />} />
              <Route path="/summary" element={<SummaryReport />} />
              <Route path="/import" element={<ImportExcel />} />
              <Route path="/users" element={<ManageUsers />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/store-tokens" element={<ManageStoreTokens />} />
            </Route>
            <Route path="/store-portal" element={<StorePortal />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
