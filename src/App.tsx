import { useEffect } from "react";
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

function Screen() {
  const { state } = useGuest();

  // Each step is a distinct screen; start every one from the top rather than
  // inheriting the previous step's scroll position.
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
      <GuestProvider>
        <Screen />
      </GuestProvider>
    </AuthProvider>
  );
}

export default App;
