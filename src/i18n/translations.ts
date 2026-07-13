import type {
  CommunicationStyle,
  MusicPreference,
  PressureLevel,
  ZoneId,
} from "../types";

export type LangCode = "pl" | "en" | "id" | "uk";

export const languages: { code: LangCode; label: string }[] = [
  { code: "pl", label: "Polski" },
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "uk", label: "Українська" },
];

type Dict = Record<LangCode, string>;

// Static UI chrome for the therapist dashboard.
export const ui: Record<string, Dict> = {
  guest: { pl: "Gość", en: "Guest", id: "Tamu", uk: "Гість" },
  treatment: { pl: "Zabieg", en: "Treatment", id: "Perawatan", uk: "Процедура" },
  bodyZones: { pl: "Strefy ciała", en: "Body zones", id: "Zona tubuh", uk: "Зони тіла" },
  front: { pl: "Przód", en: "Front", id: "Depan", uk: "Перед" },
  back: { pl: "Tył", en: "Back", id: "Belakang", uk: "Спина" },
  excludedZones: {
    pl: "Strefy wykluczone",
    en: "Excluded zones",
    id: "Zona yang dikecualikan",
    uk: "Виключені зони",
  },
  doNotMassage: {
    pl: "Nie masować",
    en: "Do not massage",
    id: "Jangan dipijat",
    uk: "Не масажувати",
  },
  priorityZones: {
    pl: "Strefy docelowe",
    en: "Priority zones",
    id: "Zona prioritas",
    uk: "Пріоритетні зони",
  },
  focusHere: {
    pl: "Skupić się na tym obszarze",
    en: "Focus on this area",
    id: "Fokus pada area ini",
    uk: "Зосередитись на цій зоні",
  },
  guestNotes: { pl: "Uwagi gościa", en: "Guest notes", id: "Catatan tamu", uk: "Нотатки гостя" },
  additionalNotes: {
    pl: "Dodatkowe uwagi",
    en: "Additional notes",
    id: "Catatan tambahan",
    uk: "Додаткові нотатки",
  },
  guestPreferences: {
    pl: "Preferencje gościa",
    en: "Guest preferences",
    id: "Preferensi tamu",
    uk: "Побажання гостя",
  },
  pressure: { pl: "Nacisk", en: "Pressure", id: "Tekanan", uk: "Тиск" },
  massageOil: {
    pl: "Olejek do masażu",
    en: "Massage oil",
    id: "Minyak pijat",
    uk: "Олія для масажу",
  },
  communication: { pl: "Komunikacja", en: "Communication", id: "Komunikasi", uk: "Спілкування" },
  tableWarming: {
    pl: "Podgrzewanie stołu",
    en: "Table warming",
    id: "Pemanas meja",
    uk: "Підігрів столу",
  },
  headrestPillow: {
    pl: "Poduszka zagłówka",
    en: "Headrest pillow",
    id: "Bantal sandaran kepala",
    uk: "Подушка для голови",
  },
  backgroundMusic: {
    pl: "Muzyka w tle",
    en: "Background music",
    id: "Musik latar",
    uk: "Фонова музика",
  },
  on: { pl: "Włączone", en: "On", id: "Aktif", uk: "Увімкнено" },
  off: { pl: "Wyłączone", en: "Off", id: "Nonaktif", uk: "Вимкнено" },
  importantWarning: {
    pl: "WAŻNE: Przestrzegaj stref wykluczonych",
    en: "IMPORTANT: Respect excluded zones",
    id: "PENTING: Patuhi zona yang dikecualikan",
    uk: "ВАЖЛИВО: Дотримуйтесь виключених зон",
  },
  warningBody: {
    pl: "Skup się na strefach docelowych zgodnie z preferencjami gościa.",
    en: "Focus on the priority zones according to the guest's preferences.",
    id: "Fokus pada zona prioritas sesuai preferensi tamu.",
    uk: "Зосередьтесь на пріоритетних зонах відповідно до побажань гостя.",
  },
  endSession: { pl: "Zakończ sesję", en: "End session", id: "Akhiri sesi", uk: "Завершити сесію" },
  lockedByGuest: {
    pl: "Preferencje zablokowane przez gościa",
    en: "Preferences locked by guest",
    id: "Preferensi dikunci oleh tamu",
    uk: "Побажання заблоковані гостем",
  },
  therapistPanel: {
    pl: "Panel Masażysty",
    en: "Therapist Panel",
    id: "Panel Terapis",
    uk: "Панель масажиста",
  },
  language: { pl: "Język", en: "Language", id: "Bahasa", uk: "Мова" },
  translate: { pl: "Przetłumacz", en: "Translate", id: "Terjemahkan", uk: "Перекласти" },
  translating: { pl: "Tłumaczenie…", en: "Translating…", id: "Menerjemahkan…", uk: "Переклад…" },
  original: { pl: "Oryginał", en: "Original", id: "Asli", uk: "Оригінал" },
};

export const zoneTranslations: Record<ZoneId, Dict> = {
  scalp: { pl: "Głowa (skóra głowy)", en: "Scalp", id: "Kulit kepala", uk: "Шкіра голови" },
  face: { pl: "Twarz", en: "Face", id: "Wajah", uk: "Обличчя" },
  decolletage: { pl: "Dekolt", en: "Décolletage", id: "Dada atas", uk: "Декольте" },
  chest: { pl: "Klatka piersiowa", en: "Chest", id: "Dada", uk: "Грудна клітка" },
  abdomen: { pl: "Brzuch", en: "Abdomen", id: "Perut", uk: "Живіт" },
  upperArmsFront: {
    pl: "Ramiona",
    en: "Upper arm (front)",
    id: "Lengan atas (depan)",
    uk: "Плече (перед)",
  },
  forearmsFront: {
    pl: "Przedramiona",
    en: "Forearm (front)",
    id: "Lengan bawah (depan)",
    uk: "Передпліччя (перед)",
  },
  hands: { pl: "Dłonie", en: "Hands", id: "Tangan", uk: "Кисті рук" },
  thighsFront: {
    pl: "Uda",
    en: "Thigh (front)",
    id: "Paha (depan)",
    uk: "Стегно (перед)",
  },
  shins: { pl: "Podudzia / Golenie", en: "Shin", id: "Tulang kering", uk: "Гомілка (перед)" },
  feetTop: { pl: "Stopy (wierzch)", en: "Foot (top)", id: "Kaki (punggung)", uk: "Стопа (верх)" },
  nape: { pl: "Kark", en: "Nape", id: "Tengkuk", uk: "Потилиця" },
  shoulders: { pl: "Barki", en: "Shoulders", id: "Bahu", uk: "Плечі" },
  upperBack: { pl: "Górny grzbiet", en: "Upper back", id: "Punggung atas", uk: "Верх спини" },
  lowerBack: { pl: "Dolny grzbiet", en: "Lower back", id: "Punggung bawah", uk: "Низ спини" },
  upperArmsBack: {
    pl: "Ramiona (tył)",
    en: "Upper arm (back)",
    id: "Lengan atas (belakang)",
    uk: "Плече (зад)",
  },
  forearmsBack: {
    pl: "Przedramiona (tył)",
    en: "Forearm (back)",
    id: "Lengan bawah (belakang)",
    uk: "Передпліччя (зад)",
  },
  glutes: { pl: "Pośladki", en: "Glutes", id: "Bokong", uk: "Сідниці" },
  thighsBack: {
    pl: "Uda (tył)",
    en: "Thigh (back)",
    id: "Paha (belakang)",
    uk: "Стегно (зад)",
  },
  calves: { pl: "Łydki", en: "Calf", id: "Betis", uk: "Литка" },
  feetSole: {
    pl: "Stopy (podeszwa)",
    en: "Foot (sole)",
    id: "Telapak kaki",
    uk: "Стопа (підошва)",
  },
};

export const massageNameTranslations: Record<string, Dict> = {
  balijski: {
    pl: "Masaż Balijski",
    en: "Balinese Massage",
    id: "Pijat Bali",
    uk: "Балійський масаж",
  },
  gleboki: {
    pl: "Masaż Głęboki",
    en: "Deep Tissue Massage",
    id: "Pijat Jaringan Dalam",
    uk: "Глибокий масаж",
  },
  szwedzki: {
    pl: "Masaż Szwedzki",
    en: "Swedish Massage",
    id: "Pijat Swedia",
    uk: "Шведський масаж",
  },
  "goracymi-kamieniami": {
    pl: "Masaż Gorącymi Kamieniami",
    en: "Hot Stone Massage",
    id: "Pijat Batu Panas",
    uk: "Масаж гарячими каменями",
  },
  prenatalny: {
    pl: "Masaż Prenatalny",
    en: "Prenatal Massage",
    id: "Pijat Prenatal",
    uk: "Пренатальний масаж",
  },
};

export const oilNameTranslations: Record<string, Dict> = {
  "lawenda-rumianek": {
    pl: "Lawenda i Rumianek",
    en: "Lavender & Chamomile",
    id: "Lavender & Kamomil",
    uk: "Лаванда і Ромашка",
  },
  "eukaliptus-mieta": {
    pl: "Eukaliptus i Mięta",
    en: "Eucalyptus & Mint",
    id: "Eukaliptus & Mint",
    uk: "Евкаліпт і М'ята",
  },
  "sandalowiec-cedr": {
    pl: "Sandałowiec i Cedr",
    en: "Sandalwood & Cedar",
    id: "Cendana & Cedar",
    uk: "Сандал і Кедр",
  },
  bezzapachowy: {
    pl: "Bezzapachowy",
    en: "Unscented",
    id: "Tanpa Aroma",
    uk: "Без запаху",
  },
};

export const pressureTranslations: Record<PressureLevel, Dict> = {
  Lekki: { pl: "Lekki", en: "Light", id: "Ringan", uk: "Легкий" },
  Średni: { pl: "Średni", en: "Medium", id: "Sedang", uk: "Середній" },
  Mocny: { pl: "Mocny", en: "Firm", id: "Kuat", uk: "Сильний" },
  Głęboki: { pl: "Głęboki", en: "Deep", id: "Dalam", uk: "Глибокий" },
};

export const communicationTranslations: Record<CommunicationStyle, Dict> = {
  silent: { pl: "Sesja w ciszy", en: "Silent session", id: "Sesi hening", uk: "Сесія в тиші" },
  guided: { pl: "Z przewodnikiem", en: "Guided", id: "Dengan panduan", uk: "З підказками" },
};

export const musicTranslations: Record<MusicPreference, Dict> = {
  nature: { pl: "Dźwięki natury", en: "Nature sounds", id: "Suara alam", uk: "Звуки природи" },
  ambient: { pl: "Ambient", en: "Ambient", id: "Ambient", uk: "Ембіент" },
  silence: { pl: "Cisza", en: "Silence", id: "Hening", uk: "Тиша" },
};

export const pillowTranslations: Record<string, Dict> = {
  Standardowa: { pl: "Standardowa", en: "Standard", id: "Standar", uk: "Стандартна" },
  "Ultra-miękka": { pl: "Ultra-miękka", en: "Ultra-soft", id: "Ultra-lembut", uk: "Ультрам'яка" },
};

export function t(key: string, lang: LangCode): string {
  return ui[key]?.[lang] ?? ui[key]?.pl ?? key;
}

export function tZone(zoneId: string, lang: LangCode): string {
  return zoneTranslations[zoneId as ZoneId]?.[lang] ?? zoneId;
}
