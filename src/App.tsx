import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { GuestProvider, useGuest } from "./context/GuestContext";
import { CatalogProvider } from "./context/CatalogContext";
import { DeviceProvider, useDevice } from "./context/DeviceContext";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { Header } from "./components/Header";
import { ActivationScreen } from "./components/pairing/ActivationScreen";
import { WelcomeStep } from "./components/steps/WelcomeStep";
import { StaffHandoffStep } from "./components/steps/StaffHandoffStep";
import { BodyMapStep } from "./components/steps/BodyMapStep";
import { PreferencesStep } from "./components/steps/PreferencesStep";
import { GuestHandoffStep } from "./components/steps/GuestHandoffStep";
import { HandoffStep } from "./components/steps/HandoffStep";
import { MasseurDashboard } from "./components/steps/MasseurDashboard";
import { LoginPage } from "./components/auth/LoginPage";
import { AcceptInvite } from "./components/auth/AcceptInvite";
import { PlatformAdminDashboard } from "./components/admin/PlatformAdminDashboard";
import { OfferCMS } from "./components/manage/OfferCMS";
import { TherapistQueue } from "./components/queue/TherapistQueue";
import { StaffManagement } from "./components/staff/StaffManagement";
import { KioskManagement } from "./components/manage/KioskManagement";

// Device-pairing gate for the kiosk route. Shows the activation screen when the
// device isn't paired — UNLESS a legacy `?location=` override or a `?demo` param
// is present (both keep working: prod tablets on ?location=, local demos on
// ?demo / no param during dev). CatalogProvider resolves the actual location
// from the param or the paired device.
function KioskGate({ children }: { children: React.ReactNode }) {
  const { status } = useDevice();
  const [searchParams] = useSearchParams();
  const hasOverride = searchParams.has("location") || searchParams.has("demo");

  if (hasOverride) return <>{children}</>;
  if (status === "checking") {
    return <div className="flex min-h-screen items-center justify-center bg-cream text-slate">…</div>;
  }
  if (status === "unpaired") return <ActivationScreen />;
  return <>{children}</>;
}

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
              <DeviceProvider>
                <KioskGate>
                  <CatalogProvider>
                    <GuestProvider>
                      <KioskScreen />
                    </GuestProvider>
                  </CatalogProvider>
                </KioskGate>
              </DeviceProvider>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/welcome" element={<AcceptInvite />} />
          <Route path="/admin" element={<PlatformAdminDashboard />} />
          <Route path="/manage" element={<OfferCMS />} />
          <Route path="/queue" element={<TherapistQueue />} />
          <Route path="/staff" element={<StaffManagement />} />
          <Route path="/kiosks" element={<KioskManagement />} />
        </Routes>
      </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
