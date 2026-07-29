import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { POList } from "./pages/POList";
import { CreatePO } from "./pages/CreatePO";
import { PODetail } from "./pages/PODetail";
import { GRNUpload } from "./pages/GRNUpload";
import { GRNList } from "./pages/GRNList";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/purchase-orders" element={<POList />} />
        <Route path="/purchase-orders/new" element={<CreatePO />} />
        <Route path="/purchase-orders/:id" element={<PODetail />} />
        <Route path="/grns" element={<GRNList />} />
        <Route path="/grns/upload" element={<GRNUpload />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
