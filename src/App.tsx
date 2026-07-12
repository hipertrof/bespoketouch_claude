import { GuestProvider, useGuest } from "./context/GuestContext";
import { Header } from "./components/Header";
import { WelcomeStep } from "./components/steps/WelcomeStep";
import { StaffHandoffStep } from "./components/steps/StaffHandoffStep";
import { BodyMapStep } from "./components/steps/BodyMapStep";
import { PreferencesStep } from "./components/steps/PreferencesStep";
import { HandoffStep } from "./components/steps/HandoffStep";
import { MasseurDashboard } from "./components/steps/MasseurDashboard";

function Screen() {
  const { state } = useGuest();

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <Header step={state.step} />
      <main className="flex-1">
        {state.step === "welcome" && <WelcomeStep />}
        {state.step === "staffHandoff" && <StaffHandoffStep />}
        {state.step === "bodyMap" && <BodyMapStep />}
        {state.step === "preferences" && <PreferencesStep />}
        {state.step === "handoff" && <HandoffStep />}
        {state.step === "masseur" && <MasseurDashboard />}
      </main>
    </div>
  );
}

function App() {
  return (
    <GuestProvider>
      <Screen />
    </GuestProvider>
  );
}

export default App;
