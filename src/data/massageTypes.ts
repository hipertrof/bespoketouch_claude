import type { MassageType, MassageDuration, PartySize } from "../types";

// Catalog sourced from nusaspa.pl/oferta/ (rituals excluded — spa massages
// only). Promotional prices are treated as the regular price; the site's
// crossed-out "original" prices are not carried over.
export const massageTypes: MassageType[] = [
  {
    id: "tajski",
    name: "Masaż Tajski",
    description:
      "Techniki rozciągania i ucisku wzorowane na tradycyjnym masażu tajskim, poprawiające elastyczność i krążenie.",
    durations: [
      { minutes: 60, priceSingle: 264, priceCouple: 504 },
      { minutes: 90, priceSingle: 352, priceCouple: 672 },
    ],
  },
  {
    id: "balijski",
    name: "Masaż Balijski",
    description:
      "Rytmiczne, głębokie ruchy łączące akupresurę i aromaterapię dla pełnego odprężenia ciała i umysłu.",
    durations: [
      { minutes: 60, priceSingle: 264, priceCouple: 504 },
      { minutes: 90, priceSingle: 352, priceCouple: 672 },
      { minutes: 120, priceSingle: 488, priceCouple: 888 },
    ],
  },
  {
    id: "balijski-cieplymi-olejkami",
    name: "Masaż Balijski Ciepłymi Olejkami",
    description:
      "Rozgrzane olejki wzmacniają rozluźnienie mięśni i pogłębiają relaks typowy dla balijskiej techniki.",
    durations: [
      { minutes: 60, priceSingle: 280, priceCouple: 528 },
      { minutes: 90, priceSingle: 368, priceCouple: 696 },
      { minutes: 120, priceSingle: 504, priceCouple: 912 },
    ],
  },
  {
    id: "balijski-maslo-shea",
    name: "Masaż Balijski z Masłem Shea",
    description:
      "Odżywcze masło shea nawilża skórę, a klasyczne balijskie ruchy koją napięte mięśnie.",
    durations: [
      { minutes: 60, priceSingle: 280 },
      { minutes: 90, priceSingle: 368 },
      { minutes: 120, priceSingle: 504 },
    ],
  },
  {
    id: "balijski-mocny",
    name: "Masaż Balijski Mocny (Sportowy)",
    description:
      "Intensywniejszy wariant masażu balijskiego z mocniejszym uciskiem, polecany po wysiłku fizycznym.",
    durations: [
      { minutes: 60, priceSingle: 280, priceCouple: 520 },
      { minutes: 90, priceSingle: 368, priceCouple: 688 },
    ],
  },
  {
    id: "lomi-lomi",
    name: "Masaż Lomi Lomi",
    description:
      "Hawajska technika płynnych, tanecznych ruchów przedramion, wspierająca głęboki relaks i uwalnianie napięć.",
    durations: [
      { minutes: 60, priceSingle: 264, priceCouple: 504 },
      { minutes: 90, priceCouple: 672 },
      { minutes: 120, priceSingle: 488, priceCouple: 888 },
    ],
  },
  {
    id: "bambusem-relaksacyjny",
    name: "Relaksacyjny Masaż Bambusem",
    description:
      "Ciepłe bambusowe kije rozprowadzają nacisk równomiernie, koją mięśnie i wspomagają krążenie.",
    durations: [
      { minutes: 60, priceSingle: 264, priceCouple: 504 },
      { minutes: 90, priceSingle: 352, priceCouple: 672 },
    ],
  },
  {
    id: "bambusem-antycellulitowy",
    name: "Antycellulitowy Masaż Bambusem",
    description:
      "Energiczna praca bambusowymi kijami ujędrniająca skórę i pobudzająca mikrokrążenie.",
    durations: [
      { minutes: 60, priceSingle: 280, priceCouple: 520 },
      { minutes: 90, priceSingle: 368, priceCouple: 688 },
    ],
  },
  {
    id: "gornej-czesci-ciala",
    name: "Masaż Górnej Części Ciała",
    description:
      "Skoncentrowana praca na karku, barkach i plecach — idealna na krótką przerwę od napięcia.",
    durations: [
      { minutes: 30, priceSingle: 248, priceCouple: 488 },
      { minutes: 60, priceSingle: 328, priceCouple: 648 },
    ],
  },
  {
    id: "stop-refleksologia",
    name: "Masaż Stóp z Refleksologią",
    description:
      "Punktowy ucisk stref refleksyjnych stóp wspierający naturalną równowagę całego organizmu.",
    durations: [
      { minutes: 30, priceSingle: 168 },
      { minutes: 60, priceSingle: 264 },
    ],
  },
  {
    id: "twarzy-arganowy",
    name: "Odmładzający Masaż Twarzy Olejkiem Arganowym",
    description:
      "Delikatne, ujędrniające ruchy z olejkiem arganowym poprawiające jędrność i blask skóry twarzy.",
    durations: [
      { minutes: 30, priceSingle: 168, priceCouple: 328 },
      { minutes: 60, priceSingle: 264, priceCouple: 504 },
    ],
  },
  {
    id: "twarzy-liftingujacy",
    name: "Nusa Liftingujący Masaż Twarzy",
    description:
      "Autorska technika modelująca kontury twarzy i redukująca oznaki zmęczenia.",
    durations: [{ minutes: 60, priceSingle: 304 }],
  },
  {
    id: "balijski-ciaza",
    name: "Masaż Balijski dla Kobiet w Ciąży",
    description:
      "Bezpieczna, łagodna odmiana masażu balijskiego dostosowana do potrzeb przyszłych mam.",
    durations: [
      { minutes: 60, priceSingle: 264 },
      { minutes: 90, priceSingle: 352 },
    ],
  },
  {
    id: "balijski-dzieci",
    name: "Masaż Balijski dla Dzieci",
    description:
      "Delikatna wersja masażu balijskiego stworzona z myślą o najmłodszych gościach.",
    durations: [
      { minutes: 30, priceSingle: 168 },
      { minutes: 60, priceSingle: 264 },
      { minutes: 90, priceSingle: 352 },
    ],
  },
  {
    id: "goracymi-kamieniami",
    name: "Masaż Gorącymi Kamieniami",
    description:
      "Ciepło wulkanicznych kamieni bazaltowych rozluźnia mięśnie i koi zmysły od pierwszej chwili.",
    durations: [
      { minutes: 90, priceSingle: 368, priceCouple: 688 },
      { minutes: 120, priceSingle: 504, priceCouple: 904 },
    ],
  },
  {
    id: "stemplami",
    name: "Masaż Stemplami",
    description:
      "Rozgrzane stemple ziołowe uwalniają aromaty i intensyfikują rozluźnienie głębokich partii mięśni.",
    durations: [
      { minutes: 60, priceSingle: 304, priceCouple: 544 },
      { minutes: 90, priceSingle: 392, priceCouple: 712 },
    ],
  },
  {
    id: "goraca-swieca",
    name: "Masaż Gorącą Świecą",
    description:
      "Ciepły wosk świecy zamienia się w odżywczy olejek do masażu, pielęgnując i relaksując skórę.",
    durations: [
      { minutes: 60, priceSingle: 304, priceCouple: 510 },
      { minutes: 90, priceSingle: 392, priceCouple: 668 },
    ],
  },
  {
    id: "cztery-rece",
    name: "Ekskluzywny Masaż na 4 Ręce",
    description:
      "Dwóch terapeutów pracujących w zsynchronizowanym rytmie dla wyjątkowo głębokiego odprężenia.",
    durations: [
      { minutes: 60, priceSingle: 504, priceCouple: 984 },
      { minutes: 90, priceSingle: 672, priceCouple: 1312 },
    ],
  },
];

export const formatPrice = (pln: number): string => `${pln} zł`;

export const durationPrice = (
  duration: MassageDuration,
  partySize: PartySize,
): number | undefined => (partySize === 1 ? duration.priceSingle : duration.priceCouple);

export const availableDurations = (
  massage: MassageType,
  partySize: PartySize,
): MassageDuration[] =>
  massage.durations.filter((d) => durationPrice(d, partySize) !== undefined);

export const isAvailableForPartySize = (massage: MassageType, partySize: PartySize): boolean =>
  availableDurations(massage, partySize).length > 0;

// Lowest price across a massage's available durations for a given party
// size — used for the "od 264 zł" preview before a duration is picked.
export const lowestPrice = (massage: MassageType, partySize: PartySize): number | undefined => {
  const prices = availableDurations(massage, partySize)
    .map((d) => durationPrice(d, partySize))
    .filter((p): p is number => p !== undefined);
  return prices.length > 0 ? Math.min(...prices) : undefined;
};

// Every duration offered by at least one massage at this party size — used
// to let staff pick a duration before narrowing down which massages fit it
// (not every massage offers every duration).
export const allDurationsForPartySize = (partySize: PartySize): number[] => {
  const minutes = new Set<number>();
  massageTypes.forEach((m) => {
    availableDurations(m, partySize).forEach((d) => minutes.add(d.minutes));
  });
  return [...minutes].sort((a, b) => a - b);
};
