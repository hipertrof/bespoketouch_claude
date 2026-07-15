import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuestProvider, useGuest } from "./context/GuestContext";
import { AuthProvider } from "./context/AuthContext";
import { Header } from "./components/Header";
import { WelcomeStep } from "./components/steps/WelcomeStep";
import { StaffHandoffStep } from "./components/steps/StaffHandoffStep";
import { BodyMapStep } from "./components/steps/BodyMapStep";
import { PreferencesStep } from "./components/steps/PreferencesStep";
import { GuestHandoffStep } from "./components/steps/GuestHandoffStep";
import { HandoffStep } from "./components/steps/HandoffStep";
import { MasseurDashboard } from "./components/steps/MasseurDashboard";
import { LoginPage } from "./components/auth/LoginPage";
import { PlatformAdminDashboard } from "./components/admin/PlatformAdminDashboard";
import { OfferCMS } from "./components/manage/OfferCMS";

// The kiosk guest-intake flow (state machine, no login). Lives at "/".
function KioskScreen() {
  const { state } = useGuest();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.step]);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <Header step={state.step} />
      <main className="flex-1">
        {state.step === "welcome" && <WelcomeStep />}
        {state.step === "staffHandoff" && <StaffHandoffStep />}
        {state.step === "bodyMap" && <BodyMapStep />}
        {state.step === "preferences" && <PreferencesStep />}
        {state.step === "guestHandoff" && <GuestHandoffStep />}
        {state.step === "handoff" && <HandoffStep />}
        {state.step === "masseur" && <MasseurDashboard />}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route
            path="/"
            element={
              <GuestProvider>
                <KioskScreen />
              </GuestProvider>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<PlatformAdminDashboard />} />
          <Route path="/manage" element={<OfferCMS />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
