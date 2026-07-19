import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { GuestProvider, useGuest } from "./context/GuestContext";
import { CatalogProvider, useCatalog } from "./context/CatalogContext";
import { brandCssVars } from "./lib/branding";
import { DeviceProvider, useDevice } from "./context/DeviceContext";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { Header } from "./components/Header";
import { ActivationScreen } from "./components/pairing/ActivationScreen";
import { SurveyScreen } from "./components/survey/SurveyScreen";
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
import { SurveyReport } from "./components/manage/SurveyReport";

// Device-pairing gate for the kiosk route. An unpaired tablet gets the
// activation screen; a paired one runs on the location its token resolves to.
//
// `?demo` is the one bypass, and it is not a backdoor: it runs the bundled
// offer with no device token, so it can read a demo catalogue but cannot write
// an intake or reach a guest profile. Phase 2 hardening retired the old
// `?location=` override — pointing a kiosk at a spa now requires pairing it.
function KioskGate({ children }: { children: React.ReactNode }) {
  const { status } = useDevice();
  const [searchParams] = useSearchParams();

  if (searchParams.has("demo")) return <>{children}</>;
  if (status === "checking") {
    return <div className="flex min-h-screen items-center justify-center bg-cream text-slate">…</div>;
  }
  if (status === "unpaired") return <ActivationScreen />;
  return <>{children}</>;
}

// The kiosk guest-intake flow (state machine, no login). Lives at "/".
function KioskScreen() {
  const { state } = useGuest();
  const { branding } = useCatalog();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.step]);

  return (
    // Per-location branding: overriding the @theme color vars here re-themes
    // every Tailwind accent utility for kiosk descendants only — dashboards
    // render outside this div and keep the stock :root palette.
    <div className="flex min-h-screen flex-col bg-cream" style={brandCssVars(branding)}>
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
          {/* Post-treatment survey — the kiosk's second mode, same device gate.
              A separate route (not a GuestContext step) so survey state can't
              entangle with a half-finished check-in. Writes are token-authed,
              so ?demo reaches the screen but cannot submit. */}
          <Route
            path="/survey"
            element={
              <DeviceProvider>
                <KioskGate>
                  <SurveyScreen />
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
          <Route path="/reports" element={<SurveyReport />} />
        </Routes>
      </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
