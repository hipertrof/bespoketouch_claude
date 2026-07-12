import { CheckCircle2, UserCog } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";

export function HandoffStep() {
  const { state, dispatch } = useGuest();

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
        <CheckCircle2 size={40} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        Dziękujemy, {state.guestName || "Gościu"}.
      </h1>
      <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
        Twoje preferencje zostały zapisane. Prosimy o przekazanie tabletu
        recepcjonistce lub masażyście.
      </p>

      <Button
        variant="secondary"
        onClick={() => dispatch({ type: "SET_STEP", step: "masseur" })}
        className="mt-16"
      >
        <UserCog size={18} />
        Panel Masażysty
      </Button>
    </div>
  );
}
