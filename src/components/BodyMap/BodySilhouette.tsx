import type { BodyGender, BodyView } from "../../types";
import { MALE_FRONT, MALE_BACK, FEMALE_FRONT, FEMALE_BACK } from "./figurePaths";

const FIGURES = {
  male: { front: MALE_FRONT, back: MALE_BACK },
  female: { front: FEMALE_FRONT, back: FEMALE_BACK },
} as const;

// Front/back share dimensions per gender, so aspect depends only on gender.
export function figureAspectRatio(gender: BodyGender): string {
  const { w, h } = FIGURES[gender].front;
  return `${w} / ${h}`;
}

export function BodySilhouette({
  view,
  gender = "male",
}: {
  view: BodyView;
  gender?: BodyGender;
}) {
  const fig = FIGURES[gender][view];
  return (
    <svg
      viewBox={`0 0 ${fig.w} ${fig.h}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <path d={fig.d} fillRule="evenodd" className="fill-slate/75" />
    </svg>
  );
}
