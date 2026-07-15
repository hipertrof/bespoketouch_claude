import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuestProvider, useGuest } from "./context/GuestContext";
import { CatalogProvider } from "./context/CatalogContext";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
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
import { TherapistQueue } from "./components/queue/TherapistQueue";

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
      <LanguageProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route
            path="/"
            element={
              <CatalogProvider>
                <GuestProvider>
                  <KioskScreen />
                </GuestProvider>
              </CatalogProvider>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<PlatformAdminDashboard />} />
          <Route path="/manage" element={<OfferCMS />} />
          <Route path="/queue" element={<TherapistQueue />} />
        </Routes>
      </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
