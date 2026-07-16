import type {
  CommunicationStyle,
  LangCode,
  MusicPreference,
  PressureLevel,
  ZoneId,
} from "../types";

// LangCode lives in ../types (so GuestState can hold it without a circular
// import); re-exported here for the many modules that import it from i18n.
export type { LangCode } from "../types";

export const languages: { code: LangCode; label: string }[] = [
  { code: "pl", label: "Polski" },
  { code: "en", label: "English" },
  { code: "uk", label: "Українська" },
  { code: "it", label: "Italiano" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "id", label: "Bahasa Indonesia" },
];

type Dict = Record<LangCode, string>;

// Static UI chrome — guest flow + therapist dashboard. Every entry must have
// all 8 languages (enforced by Record<LangCode, string>).
export const ui: Record<string, Dict> = {
  // Dashboard chrome
  guest: { pl: "Gość", en: "Guest", uk: "Гість", it: "Ospite", fr: "Invité", de: "Gast", es: "Huésped", id: "Tamu" },
  treatment: { pl: "Zabieg", en: "Treatment", uk: "Процедура", it: "Trattamento", fr: "Soin", de: "Behandlung", es: "Tratamiento", id: "Perawatan" },
  person: { pl: "Osoba", en: "Person", uk: "Особа", it: "Persona", fr: "Personne", de: "Person", es: "Persona", id: "Orang" },
  partySize: { pl: "Liczba osób", en: "Party size", uk: "Кількість осіб", it: "Numero di persone", fr: "Nombre de personnes", de: "Anzahl Personen", es: "Número de personas", id: "Jumlah orang" },
  bodyZones: { pl: "Strefy ciała", en: "Body zones", uk: "Зони тіла", it: "Zone del corpo", fr: "Zones du corps", de: "Körperzonen", es: "Zonas del cuerpo", id: "Zona tubuh" },
  front: { pl: "Przód", en: "Front", uk: "Перед", it: "Davanti", fr: "Avant", de: "Vorne", es: "Frente", id: "Depan" },
  back: { pl: "Tył", en: "Back", uk: "Спина", it: "Dietro", fr: "Arrière", de: "Hinten", es: "Espalda", id: "Belakang" },
  excludedZones: { pl: "Strefy wykluczone", en: "Excluded zones", uk: "Виключені зони", it: "Zone escluse", fr: "Zones exclues", de: "Ausgeschlossene Zonen", es: "Zonas excluidas", id: "Zona yang dikecualikan" },
  doNotMassage: { pl: "Nie masować", en: "Do not massage", uk: "Не масажувати", it: "Non massaggiare", fr: "Ne pas masser", de: "Nicht massieren", es: "No masajear", id: "Jangan dipijat" },
  priorityZones: { pl: "Strefy docelowe", en: "Priority zones", uk: "Пріоритетні зони", it: "Zone prioritarie", fr: "Zones prioritaires", de: "Prioritäre Zonen", es: "Zonas prioritarias", id: "Zona prioritas" },
  focusHere: { pl: "Skupić się na tym obszarze", en: "Focus on this area", uk: "Зосередитись на цій зоні", it: "Concentrarsi su quest'area", fr: "Se concentrer sur cette zone", de: "Auf diesen Bereich konzentrieren", es: "Concentrarse en esta zona", id: "Fokus pada area ini" },
  guestNotes: { pl: "Uwagi gościa", en: "Guest notes", uk: "Нотатки гостя", it: "Note dell'ospite", fr: "Remarques de l'invité", de: "Hinweise des Gastes", es: "Notas del huésped", id: "Catatan tamu" },
  additionalNotes: { pl: "Dodatkowe uwagi", en: "Additional notes", uk: "Додаткові нотатки", it: "Note aggiuntive", fr: "Remarques supplémentaires", de: "Zusätzliche Hinweise", es: "Notas adicionales", id: "Catatan tambahan" },
  guestPreferences: { pl: "Preferencje gościa", en: "Guest preferences", uk: "Побажання гостя", it: "Preferenze dell'ospite", fr: "Préférences de l'invité", de: "Vorlieben des Gastes", es: "Preferencias del huésped", id: "Preferensi tamu" },
  pressure: { pl: "Nacisk", en: "Pressure", uk: "Тиск", it: "Pressione", fr: "Pression", de: "Druck", es: "Presión", id: "Tekanan" },
  massageOil: { pl: "Olejek do masażu", en: "Massage oil", uk: "Олія для масажу", it: "Olio da massaggio", fr: "Huile de massage", de: "Massageöl", es: "Aceite de masaje", id: "Minyak pijat" },
  communication: { pl: "Komunikacja", en: "Communication", uk: "Спілкування", it: "Comunicazione", fr: "Communication", de: "Kommunikation", es: "Comunicación", id: "Komunikasi" },
  tableWarming: { pl: "Podgrzewanie stołu", en: "Table warming", uk: "Підігрів столу", it: "Riscaldamento del lettino", fr: "Chauffage de la table", de: "Tischheizung", es: "Calentamiento de la camilla", id: "Pemanas meja" },
  headrestPillow: { pl: "Poduszka zagłówka", en: "Headrest pillow", uk: "Подушка для голови", it: "Cuscino poggiatesta", fr: "Coussin d'appui-tête", de: "Kopfstützenkissen", es: "Almohada del reposacabezas", id: "Bantal sandaran kepala" },
  backgroundMusic: { pl: "Muzyka w tle", en: "Background music", uk: "Фонова музика", it: "Musica di sottofondo", fr: "Musique d'ambiance", de: "Hintergrundmusik", es: "Música de fondo", id: "Musik latar" },
  on: { pl: "Włączone", en: "On", uk: "Увімкнено", it: "Attivo", fr: "Activé", de: "Ein", es: "Activado", id: "Aktif" },
  off: { pl: "Wyłączone", en: "Off", uk: "Вимкнено", it: "Disattivato", fr: "Désactivé", de: "Aus", es: "Desactivado", id: "Nonaktif" },
  importantWarning: { pl: "WAŻNE: Przestrzegaj stref wykluczonych", en: "IMPORTANT: Respect excluded zones", uk: "ВАЖЛИВО: Дотримуйтесь виключених зон", it: "IMPORTANTE: Rispetta le zone escluse", fr: "IMPORTANT : Respectez les zones exclues", de: "WICHTIG: Ausgeschlossene Zonen beachten", es: "IMPORTANTE: Respete las zonas excluidas", id: "PENTING: Patuhi zona yang dikecualikan" },
  warningBody: { pl: "Skup się na strefach docelowych zgodnie z preferencjami gościa.", en: "Focus on the priority zones according to the guest's preferences.", uk: "Зосередьтесь на пріоритетних зонах відповідно до побажань гостя.", it: "Concentrati sulle zone prioritarie secondo le preferenze dell'ospite.", fr: "Concentrez-vous sur les zones prioritaires selon les préférences de l'invité.", de: "Konzentrieren Sie sich auf die prioritären Zonen gemäß den Vorlieben des Gastes.", es: "Concéntrese en las zonas prioritarias según las preferencias del huésped.", id: "Fokus pada zona prioritas sesuai preferensi tamu." },
  endSession: { pl: "Zakończ sesję", en: "End session", uk: "Завершити сесію", it: "Termina sessione", fr: "Terminer la séance", de: "Sitzung beenden", es: "Finalizar sesión", id: "Akhiri sesi" },
  lockedByGuest: { pl: "Preferencje zablokowane przez gościa", en: "Preferences locked by guest", uk: "Побажання заблоковані гостем", it: "Preferenze bloccate dall'ospite", fr: "Préférences verrouillées par l'invité", de: "Vom Gast gesperrte Vorlieben", es: "Preferencias bloqueadas por el huésped", id: "Preferensi dikunci oleh tamu" },
  therapistPanel: { pl: "Panel Masażysty", en: "Therapist Panel", uk: "Панель масажиста", it: "Pannello Massaggiatore", fr: "Panneau du Masseur", de: "Therapeuten-Panel", es: "Panel del Masajista", id: "Panel Terapis" },
  language: { pl: "Język", en: "Language", uk: "Мова", it: "Lingua", fr: "Langue", de: "Sprache", es: "Idioma", id: "Bahasa" },
  translate: { pl: "Przetłumacz", en: "Translate", uk: "Перекласти", it: "Traduci", fr: "Traduire", de: "Übersetzen", es: "Traducir", id: "Terjemahkan" },
  translating: { pl: "Tłumaczenie…", en: "Translating…", uk: "Переклад…", it: "Traduzione…", fr: "Traduction…", de: "Übersetzen…", es: "Traduciendo…", id: "Menerjemahkan…" },
  original: { pl: "Oryginał", en: "Original", uk: "Оригінал", it: "Originale", fr: "Original", de: "Original", es: "Original", id: "Asli" },

  // Header / logo / step indicator
  tagline: { pl: "Masaż skrojony na miarę", en: "Massage tailored to you", uk: "Масаж, створений для вас", it: "Massaggio su misura", fr: "Massage sur mesure", de: "Massage nach Maß", es: "Masaje a tu medida", id: "Pijat yang dirancang khusus" },
  stepWelcome: { pl: "Powitanie", en: "Welcome", uk: "Привітання", it: "Benvenuto", fr: "Accueil", de: "Willkommen", es: "Bienvenida", id: "Sambutan" },
  stepBodyMap: { pl: "Mapa ciała", en: "Body map", uk: "Карта тіла", it: "Mappa del corpo", fr: "Carte du corps", de: "Körperkarte", es: "Mapa corporal", id: "Peta tubuh" },
  stepPreferences: { pl: "Preferencje", en: "Preferences", uk: "Побажання", it: "Preferenze", fr: "Préférences", de: "Vorlieben", es: "Preferencias", id: "Preferensi" },
  stepSummary: { pl: "Podsumowanie", en: "Summary", uk: "Підсумок", it: "Riepilogo", fr: "Récapitulatif", de: "Zusammenfassung", es: "Resumen", id: "Ringkasan" },

  // WelcomeStep
  partyOne: { pl: "1 osoba", en: "1 person", uk: "1 особа", it: "1 persona", fr: "1 personne", de: "1 Person", es: "1 persona", id: "1 orang" },
  partyTwo: { pl: "2 osoby (para)", en: "2 people (couple)", uk: "2 особи (пара)", it: "2 persone (coppia)", fr: "2 personnes (couple)", de: "2 Personen (Paar)", es: "2 personas (pareja)", id: "2 orang (pasangan)" },
  checkInBadge: { pl: "Zameldowanie gościa", en: "Guest check-in", uk: "Реєстрація гостя", it: "Check-in ospite", fr: "Enregistrement de l'invité", de: "Gäste-Check-in", es: "Registro del huésped", id: "Registrasi tamu" },
  welcomeTitle: { pl: "Witaj w BespokeTouch.", en: "Welcome to BespokeTouch.", uk: "Ласкаво просимо до BespokeTouch.", it: "Benvenuto in BespokeTouch.", fr: "Bienvenue chez BespokeTouch.", de: "Willkommen bei BespokeTouch.", es: "Bienvenido a BespokeTouch.", id: "Selamat datang di BespokeTouch." },
  welcomeIntro: { pl: "Uzupełnij dane gościa i wybrany zabieg, a następnie przekaż tablet, aby mógł spersonalizować swój masaż.", en: "Fill in the guest's details and chosen treatment, then hand over the tablet so they can personalize their massage.", uk: "Заповніть дані гостя та обраний догляд, а потім передайте планшет, щоб гість міг персоналізувати свій масаж.", it: "Inserisci i dati dell'ospite e il trattamento scelto, poi consegna il tablet per personalizzare il massaggio.", fr: "Renseignez les informations de l'invité et le soin choisi, puis remettez la tablette pour qu'il personnalise son massage.", de: "Geben Sie die Daten des Gastes und die gewählte Behandlung ein und übergeben Sie dann das Tablet zur Personalisierung der Massage.", es: "Complete los datos del huésped y el tratamiento elegido, y luego entregue la tableta para que personalice su masaje.", id: "Lengkapi data tamu dan perawatan yang dipilih, lalu serahkan tablet agar mereka dapat mempersonalisasi pijatan." },
  coupleHint: { pl: "Osoby personalizują masaż kolejno, jedna po drugiej, na tym samym tablecie.", en: "Guests personalize the massage one after another on the same tablet.", uk: "Гості персоналізують масаж по черзі, один за одним, на тому самому планшеті.", it: "Gli ospiti personalizzano il massaggio uno dopo l'altro sullo stesso tablet.", fr: "Les invités personnalisent le massage l'un après l'autre sur la même tablette.", de: "Die Gäste personalisieren die Massage nacheinander auf demselben Tablet.", es: "Los huéspedes personalizan el masaje uno tras otro en la misma tableta.", id: "Tamu mempersonalisasi pijatan satu per satu di tablet yang sama." },
  nameGuest: { pl: "Imię gościa", en: "Guest's name", uk: "Ім'я гостя", it: "Nome dell'ospite", fr: "Prénom de l'invité", de: "Name des Gastes", es: "Nombre del huésped", id: "Nama tamu" },
  nameFirst: { pl: "Imię pierwszej osoby", en: "First person's name", uk: "Ім'я першої особи", it: "Nome della prima persona", fr: "Prénom de la première personne", de: "Name der ersten Person", es: "Nombre de la primera persona", id: "Nama orang pertama" },
  nameSecond: { pl: "Imię drugiej osoby", en: "Second person's name", uk: "Ім'я другої особи", it: "Nome della seconda persona", fr: "Prénom de la deuxième personne", de: "Name der zweiten Person", es: "Nombre de la segunda persona", id: "Nama orang kedua" },
  namePlaceholder: { pl: "Wpisz imię gościa", en: "Enter guest's name", uk: "Введіть ім'я гостя", it: "Inserisci il nome dell'ospite", fr: "Saisissez le prénom de l'invité", de: "Namen des Gastes eingeben", es: "Introduzca el nombre del huésped", id: "Masukkan nama tamu" },
  genderMale: { pl: "Mężczyzna", en: "Male", uk: "Чоловік", it: "Uomo", fr: "Homme", de: "Mann", es: "Hombre", id: "Pria" },
  genderFemale: { pl: "Kobieta", en: "Female", uk: "Жінка", it: "Donna", fr: "Femme", de: "Frau", es: "Mujer", id: "Wanita" },
  differentMassages: { pl: "Różne masaże dla każdej osoby", en: "Different massage for each person", uk: "Різні масажі для кожної особи", it: "Massaggi diversi per ogni persona", fr: "Massage différent pour chaque personne", de: "Unterschiedliche Massage für jede Person", es: "Masaje diferente para cada persona", id: "Pijat berbeda untuk setiap orang" },
  differentMassagesOn: { pl: "Każda osoba wybiera własny masaż; czas trwania jest wspólny dla obu.", en: "Each person picks their own massage; the duration is shared by both.", uk: "Кожна особа обирає свій масаж; тривалість спільна для обох.", it: "Ogni persona sceglie il proprio massaggio; la durata è comune a entrambi.", fr: "Chaque personne choisit son massage ; la durée est commune aux deux.", de: "Jede Person wählt ihre eigene Massage; die Dauer ist für beide gleich.", es: "Cada persona elige su propio masaje; la duración es común para ambos.", id: "Setiap orang memilih pijatannya sendiri; durasinya sama untuk keduanya." },
  differentMassagesOff: { pl: "Obie osoby otrzymują ten sam masaż.", en: "Both people receive the same massage.", uk: "Обидві особи отримують той самий масаж.", it: "Entrambe le persone ricevono lo stesso massaggio.", fr: "Les deux personnes reçoivent le même massage.", de: "Beide Personen erhalten dieselbe Massage.", es: "Ambas personas reciben el mismo masaje.", id: "Kedua orang menerima pijatan yang sama." },
  durationHeading: { pl: "Czas trwania", en: "Duration", uk: "Тривалість", it: "Durata", fr: "Durée", de: "Dauer", es: "Duración", id: "Durasi" },
  durationHintCouple: { pl: "Wspólny dla obu osób. Nie każdy masaż dostępny jest w każdym czasie trwania.", en: "Shared by both. Not every massage is available in every duration.", uk: "Спільна для обох. Не кожен масаж доступний у кожній тривалості.", it: "Comune a entrambi. Non tutti i massaggi sono disponibili in ogni durata.", fr: "Commune aux deux. Tous les massages ne sont pas disponibles pour chaque durée.", de: "Für beide gleich. Nicht jede Massage ist in jeder Dauer verfügbar.", es: "Común para ambos. No todos los masajes están disponibles en cada duración.", id: "Sama untuk keduanya. Tidak semua pijat tersedia dalam setiap durasi." },
  durationHint: { pl: "Nie każdy masaż dostępny jest w każdym czasie trwania.", en: "Not every massage is available in every duration.", uk: "Не кожен масаж доступний у кожній тривалості.", it: "Non tutti i massaggi sono disponibili in ogni durata.", fr: "Tous les massages ne sont pas disponibles pour chaque durée.", de: "Nicht jede Massage ist in jeder Dauer verfügbar.", es: "No todos los masajes están disponibles en cada duración.", id: "Tidak semua pijat tersedia dalam setiap durasi." },
  massageChoiceHeading: { pl: "Wybór masażu", en: "Massage selection", uk: "Вибір масажу", it: "Scelta del massaggio", fr: "Choix du massage", de: "Massageauswahl", es: "Selección de masaje", id: "Pilihan pijat" },
  notChosen: { pl: "nie wybrano", en: "not selected", uk: "не вибрано", it: "non selezionato", fr: "non sélectionné", de: "nicht ausgewählt", es: "no seleccionado", id: "belum dipilih" },
  noMassageForDuration: { pl: "Żaden zabieg nie jest dostępny w wybranym czasie trwania — wybierz inny czas trwania.", en: "No treatment is available in the selected duration — choose a different duration.", uk: "Жоден догляд недоступний для обраної тривалості — виберіть іншу тривалість.", it: "Nessun trattamento è disponibile nella durata selezionata — scegli un'altra durata.", fr: "Aucun soin n'est disponible pour la durée sélectionnée — choisissez une autre durée.", de: "Für die gewählte Dauer ist keine Behandlung verfügbar — wählen Sie eine andere Dauer.", es: "Ningún tratamiento está disponible en la duración seleccionada — elija otra duración.", id: "Tidak ada perawatan yang tersedia dalam durasi yang dipilih — pilih durasi lain." },
  priceFrom: { pl: "od {price}", en: "from {price}", uk: "від {price}", it: "da {price}", fr: "à partir de {price}", de: "ab {price}", es: "desde {price}", id: "dari {price}" },
  handToGuest: { pl: "Przekaż tablet gościowi", en: "Hand the tablet to the guest", uk: "Передайте планшет гостю", it: "Consegna il tablet all'ospite", fr: "Remettez la tablette à l'invité", de: "Tablet an den Gast übergeben", es: "Entregue la tableta al huésped", id: "Serahkan tablet kepada tamu" },

  // StaffHandoffStep
  allReady: { pl: "Wszystko gotowe, {name}.", en: "All set, {name}.", uk: "Усе готово, {name}.", it: "Tutto pronto, {name}.", fr: "Tout est prêt, {name}.", de: "Alles bereit, {name}.", es: "Todo listo, {name}.", id: "Semua siap, {name}." },
  chosenTreatment: { pl: "Wybrany zabieg to {treatment}.", en: "The chosen treatment is {treatment}.", uk: "Обраний догляд — {treatment}.", it: "Il trattamento scelto è {treatment}.", fr: "Le soin choisi est {treatment}.", de: "Die gewählte Behandlung ist {treatment}.", es: "El tratamiento elegido es {treatment}.", id: "Perawatan yang dipilih adalah {treatment}." },
  treatmentAlreadyChosen: { pl: "Twój zabieg jest już wybrany.", en: "Your treatment is already selected.", uk: "Ваш догляд уже вибрано.", it: "Il tuo trattamento è già selezionato.", fr: "Votre soin est déjà sélectionné.", de: "Ihre Behandlung ist bereits ausgewählt.", es: "Su tratamiento ya está seleccionado.", id: "Perawatan Anda sudah dipilih." },
  personalizePrompt: { pl: "Zaznacz teraz obszary pracy na mapie ciała i dopasuj swoje preferencje.", en: "Now mark the work areas on the body map and adjust your preferences.", uk: "Тепер позначте зони роботи на карті тіла та налаштуйте свої побажання.", it: "Ora segna le aree di lavoro sulla mappa del corpo e regola le tue preferenze.", fr: "Marquez maintenant les zones de travail sur la carte du corps et ajustez vos préférences.", de: "Markieren Sie nun die Arbeitsbereiche auf der Körperkarte und passen Sie Ihre Vorlieben an.", es: "Ahora marque las áreas de trabajo en el mapa corporal y ajuste sus preferencias.", id: "Sekarang tandai area kerja pada peta tubuh dan sesuaikan preferensi Anda." },
  coupleFlowSeparate: { pl: "Każda osoba ma wybrany własny zabieg — najpierw personalizuje pierwsza osoba, a po zakończeniu przekażecie tablet drugiej.", en: "Each person has their own treatment — the first person personalizes first, then you pass the tablet to the second.", uk: "Кожна особа має власний догляд — спершу персоналізує перша особа, а потім ви передасте планшет другій.", it: "Ogni persona ha il proprio trattamento — prima personalizza la prima persona, poi passate il tablet alla seconda.", fr: "Chaque personne a son propre soin — la première personne personnalise d'abord, puis vous passez la tablette à la seconde.", de: "Jede Person hat ihre eigene Behandlung — zuerst personalisiert die erste Person, dann geben Sie das Tablet an die zweite weiter.", es: "Cada persona tiene su propio tratamiento — primero personaliza la primera persona y luego pasan la tableta a la segunda.", id: "Setiap orang memiliki perawatannya sendiri — orang pertama mempersonalisasi dahulu, lalu serahkan tablet ke orang kedua." },
  coupleFlowShared: { pl: "Ten zabieg jest dla dwóch osób — najpierw personalizuje pierwsza osoba, a po zakończeniu przekażecie tablet drugiej.", en: "This treatment is for two people — the first person personalizes first, then you pass the tablet to the second.", uk: "Цей догляд для двох осіб — спершу персоналізує перша особа, а потім ви передасте планшет другій.", it: "Questo trattamento è per due persone — prima personalizza la prima persona, poi passate il tablet alla seconda.", fr: "Ce soin est pour deux personnes — la première personne personnalise d'abord, puis vous passez la tablette à la seconde.", de: "Diese Behandlung ist für zwei Personen — zuerst personalisiert die erste Person, dann geben Sie das Tablet an die zweite weiter.", es: "Este tratamiento es para dos personas — primero personaliza la primera persona y luego pasan la tableta a la segunda.", id: "Perawatan ini untuk dua orang — orang pertama mempersonalisasi dahulu, lalu serahkan tablet ke orang kedua." },
  startPersonalization: { pl: "Rozpocznij personalizację", en: "Start personalization", uk: "Почати персоналізацію", it: "Inizia la personalizzazione", fr: "Commencer la personnalisation", de: "Personalisierung starten", es: "Comenzar la personalización", id: "Mulai personalisasi" },

  // BodyMapStep
  workAreasTitle: { pl: "Obszary pracy", en: "Work areas", uk: "Зони роботи", it: "Aree di lavoro", fr: "Zones de travail", de: "Arbeitsbereiche", es: "Áreas de trabajo", id: "Area kerja" },
  workAreasIntro: { pl: "Wskaż miejsca wymagające szczególnej uwagi — lub te, które powinniśmy pominąć.", en: "Point out spots that need special attention — or those we should skip.", uk: "Вкажіть місця, що потребують особливої уваги — або ті, які слід пропустити.", it: "Indica i punti che richiedono attenzione particolare — o quelli da evitare.", fr: "Indiquez les points nécessitant une attention particulière — ou ceux à éviter.", de: "Zeigen Sie Stellen an, die besondere Aufmerksamkeit brauchen — oder die wir auslassen sollen.", es: "Señale los puntos que necesitan atención especial — o los que debemos evitar.", id: "Tunjukkan area yang perlu perhatian khusus — atau yang harus kami lewati." },
  selectedZonesHeading: { pl: "Zestawienie wybranych stref", en: "Selected zones overview", uk: "Огляд вибраних зон", it: "Riepilogo zone selezionate", fr: "Aperçu des zones sélectionnées", de: "Übersicht ausgewählter Zonen", es: "Resumen de zonas seleccionadas", id: "Ringkasan zona terpilih" },
  noZonesSelected: { pl: "Nie zaznaczono jeszcze żadnych stref. Dotknij punktu na sylwetce, aby oznaczyć obszar jako priorytetowy lub wykluczony.", en: "No zones selected yet. Tap a point on the figure to mark an area as priority or excluded.", uk: "Ще не вибрано жодної зони. Торкніться точки на силуеті, щоб позначити зону як пріоритетну або виключену.", it: "Nessuna zona ancora selezionata. Tocca un punto sulla figura per segnare un'area come prioritaria o esclusa.", fr: "Aucune zone sélectionnée. Touchez un point sur la silhouette pour marquer une zone comme prioritaire ou exclue.", de: "Noch keine Zonen ausgewählt. Tippen Sie auf einen Punkt der Figur, um einen Bereich als prioritär oder ausgeschlossen zu markieren.", es: "Aún no hay zonas seleccionadas. Toque un punto en la figura para marcar un área como prioritaria o excluida.", id: "Belum ada zona yang dipilih. Ketuk titik pada gambar untuk menandai area sebagai prioritas atau dikecualikan." },
  intensiveWork: { pl: "Intensywna praca (priorytet)", en: "Intensive work (priority)", uk: "Інтенсивна робота (пріоритет)", it: "Lavoro intensivo (priorità)", fr: "Travail intensif (priorité)", de: "Intensive Arbeit (Priorität)", es: "Trabajo intensivo (prioridad)", id: "Kerja intensif (prioritas)" },
  doNotMassageZone: { pl: "Nie masować (strefa wykluczona)", en: "Do not massage (excluded zone)", uk: "Не масажувати (виключена зона)", it: "Non massaggiare (zona esclusa)", fr: "Ne pas masser (zone exclue)", de: "Nicht massieren (ausgeschlossene Zone)", es: "No masajear (zona excluida)", id: "Jangan dipijat (zona dikecualikan)" },
  notesOtherZones: { pl: "Uwagi do pozostałych stref", en: "Notes on other zones", uk: "Нотатки до інших зон", it: "Note sulle altre zone", fr: "Remarques sur les autres zones", de: "Hinweise zu weiteren Zonen", es: "Notas sobre otras zonas", id: "Catatan zona lain" },
  generalNoteLabel: { pl: "Dodatkowe uwagi / zalecenia dla masażysty", en: "Additional notes / recommendations for the therapist", uk: "Додаткові нотатки / рекомендації для масажиста", it: "Note aggiuntive / raccomandazioni per il massaggiatore", fr: "Remarques / recommandations pour le masseur", de: "Zusätzliche Hinweise / Empfehlungen für den Therapeuten", es: "Notas adicionales / recomendaciones para el masajista", id: "Catatan tambahan / rekomendasi untuk terapis" },
  generalNoteHelp: { pl: "Wpisz zalecenia, bolesne punkty, alergie lub inne szczególne wymagania.", en: "Note recommendations, painful spots, allergies or other special requirements.", uk: "Вкажіть рекомендації, болючі місця, алергії чи інші особливі вимоги.", it: "Indica raccomandazioni, punti dolenti, allergie o altre esigenze particolari.", fr: "Notez les recommandations, points douloureux, allergies ou autres besoins particuliers.", de: "Notieren Sie Empfehlungen, schmerzhafte Stellen, Allergien oder andere besondere Anforderungen.", es: "Anote recomendaciones, puntos dolorosos, alergias u otros requisitos especiales.", id: "Tuliskan rekomendasi, titik nyeri, alergi, atau kebutuhan khusus lainnya." },
  generalNotePlaceholder: { pl: "Np. proszę o mocniejszy masaż karku, mam alergię na olejki cytrusowe…", en: "E.g. please massage the neck more firmly, I'm allergic to citrus oils…", uk: "Напр. будь ласка, сильніше масажуйте шию, у мене алергія на цитрусові олії…", it: "Es. per favore massaggia il collo più intensamente, sono allergico agli oli di agrumi…", fr: "Ex. massez la nuque plus fermement, je suis allergique aux huiles d'agrumes…", de: "Z. B. bitte den Nacken kräftiger massieren, ich bin allergisch gegen Zitrusöle…", es: "P. ej. masajee el cuello con más fuerza, soy alérgico a los aceites cítricos…", id: "Mis. tolong pijat leher lebih kuat, saya alergi minyak jeruk…" },
  backButton: { pl: "Wstecz", en: "Back", uk: "Назад", it: "Indietro", fr: "Retour", de: "Zurück", es: "Atrás", id: "Kembali" },
  saveContinue: { pl: "Zapisz i kontynuuj", en: "Save and continue", uk: "Зберегти та продовжити", it: "Salva e continua", fr: "Enregistrer et continuer", de: "Speichern und fortfahren", es: "Guardar y continuar", id: "Simpan dan lanjutkan" },

  // ZonePopover
  zonePriority: { pl: "Obszar priorytetowy", en: "Priority area", uk: "Пріоритетна зона", it: "Area prioritaria", fr: "Zone prioritaire", de: "Prioritärer Bereich", es: "Área prioritaria", id: "Area prioritas" },
  zoneStandard: { pl: "Standardowa uwaga", en: "Standard attention", uk: "Стандартна увага", it: "Attenzione standard", fr: "Attention standard", de: "Standardbehandlung", es: "Atención estándar", id: "Perhatian standar" },
  close: { pl: "Zamknij", en: "Close", uk: "Закрити", it: "Chiudi", fr: "Fermer", de: "Schließen", es: "Cerrar", id: "Tutup" },
  notes: { pl: "Uwagi", en: "Notes", uk: "Нотатки", it: "Note", fr: "Remarques", de: "Hinweise", es: "Notas", id: "Catatan" },
  zoneNotePlaceholder: { pl: "np. blizna, wrażliwa skóra…", en: "e.g. scar, sensitive skin…", uk: "напр. шрам, чутлива шкіра…", it: "es. cicatrice, pelle sensibile…", fr: "ex. cicatrice, peau sensible…", de: "z. B. Narbe, empfindliche Haut…", es: "p. ej. cicatriz, piel sensible…", id: "mis. bekas luka, kulit sensitif…" },
  done: { pl: "Gotowe", en: "Done", uk: "Готово", it: "Fatto", fr: "Terminé", de: "Fertig", es: "Listo", id: "Selesai" },

  // PreferencesStep
  prefsTitle: { pl: "Twoje preferencje", en: "Your preferences", uk: "Ваші побажання", it: "Le tue preferenze", fr: "Vos préférences", de: "Ihre Vorlieben", es: "Sus preferencias", id: "Preferensi Anda" },
  prefsIntro: { pl: "Dopasuj masaż do swoich potrzeb. Wszystko po to, aby stworzyć Twoje idealne doświadczenie.", en: "Tailor the massage to your needs — all to create your perfect experience.", uk: "Налаштуйте масаж під свої потреби — усе, щоб створити ваш ідеальний досвід.", it: "Adatta il massaggio alle tue esigenze — tutto per creare la tua esperienza perfetta.", fr: "Adaptez le massage à vos besoins — le tout pour créer votre expérience idéale.", de: "Passen Sie die Massage an Ihre Bedürfnisse an — alles für Ihr perfektes Erlebnis.", es: "Adapte el masaje a sus necesidades — todo para crear su experiencia perfecta.", id: "Sesuaikan pijatan dengan kebutuhan Anda — semua untuk menciptakan pengalaman sempurna Anda." },
  pressureCardTitle: { pl: "Siła nacisku", en: "Pressure intensity", uk: "Сила тиску", it: "Intensità della pressione", fr: "Intensité de la pression", de: "Druckstärke", es: "Intensidad de presión", id: "Intensitas tekanan" },
  pressureCardDesc: { pl: "Wybierz preferowaną intensywność nacisku podczas masażu.", en: "Choose your preferred pressure intensity during the massage.", uk: "Оберіть бажану інтенсивність тиску під час масажу.", it: "Scegli l'intensità di pressione preferita durante il massaggio.", fr: "Choisissez l'intensité de pression que vous préférez pendant le massage.", de: "Wählen Sie Ihre bevorzugte Druckstärke während der Massage.", es: "Elija la intensidad de presión que prefiera durante el masaje.", id: "Pilih intensitas tekanan yang Anda sukai selama pijat." },
  oilCardDesc: { pl: "Wybierz kompozycję zapachową, która wspiera Twoje samopoczucie.", en: "Choose the scent blend that supports your well-being.", uk: "Оберіть аромат, що підтримує ваше самопочуття.", it: "Scegli la composizione aromatica che favorisce il tuo benessere.", fr: "Choisissez la composition olfactive qui soutient votre bien-être.", de: "Wählen Sie die Duftkomposition, die Ihr Wohlbefinden unterstützt.", es: "Elija la composición aromática que favorezca su bienestar.", id: "Pilih paduan aroma yang mendukung kesejahteraan Anda." },
  tableWarmingCardDesc: { pl: "Ciepły stół zwiększa komfort i pomaga w rozluźnieniu mięśni.", en: "A warm table increases comfort and helps relax the muscles.", uk: "Теплий стіл підвищує комфорт і допомагає розслабити м'язи.", it: "Un lettino caldo aumenta il comfort e aiuta a rilassare i muscoli.", fr: "Une table chaude augmente le confort et aide à détendre les muscles.", de: "Ein warmer Tisch erhöht den Komfort und hilft, die Muskeln zu entspannen.", es: "Una camilla caliente aumenta el confort y ayuda a relajar los músculos.", id: "Meja hangat meningkatkan kenyamanan dan membantu merilekskan otot." },
  communicationCardDesc: { pl: "Wybierz preferowany sposób komunikacji podczas masażu.", en: "Choose your preferred way of communicating during the massage.", uk: "Оберіть бажаний спосіб спілкування під час масажу.", it: "Scegli il modo di comunicare che preferisci durante il massaggio.", fr: "Choisissez votre mode de communication préféré pendant le massage.", de: "Wählen Sie Ihre bevorzugte Art der Kommunikation während der Massage.", es: "Elija su forma preferida de comunicación durante el masaje.", id: "Pilih cara komunikasi yang Anda sukai selama pijat." },
  commSilentSubtitle: { pl: "Skupienie na relaksie i oddechu.", en: "Focus on relaxation and breathing.", uk: "Зосередження на розслабленні та диханні.", it: "Concentrazione su relax e respiro.", fr: "Concentration sur la détente et la respiration.", de: "Fokus auf Entspannung und Atmung.", es: "Concentración en la relajación y la respiración.", id: "Fokus pada relaksasi dan pernapasan." },
  commGuidedSubtitle: { pl: "Terapeuta będzie informował i pytał o odczucia.", en: "The therapist will inform you and ask about sensations.", uk: "Масажист інформуватиме та запитуватиме про відчуття.", it: "Il terapista ti informerà e chiederà delle sensazioni.", fr: "Le thérapeute vous informera et s'enquerra de vos sensations.", de: "Der Therapeut informiert Sie und fragt nach Ihren Empfindungen.", es: "El terapeuta le informará y preguntará sobre sus sensaciones.", id: "Terapis akan memberi tahu dan menanyakan sensasi Anda." },
  confirmLock: { pl: "Zatwierdź i zablokuj preferencje", en: "Confirm and lock preferences", uk: "Підтвердити та заблокувати побажання", it: "Conferma e blocca le preferenze", fr: "Confirmer et verrouiller les préférences", de: "Vorlieben bestätigen und sperren", es: "Confirmar y bloquear preferencias", id: "Konfirmasi dan kunci preferensi" },
  pressureDescLight: { pl: "Lekki nacisk – delikatny i kojący.", en: "Light pressure – gentle and soothing.", uk: "Легкий тиск – ніжний і заспокійливий.", it: "Pressione leggera – delicata e lenitiva.", fr: "Pression légère – douce et apaisante.", de: "Sanfter Druck – zart und beruhigend.", es: "Presión ligera – suave y calmante.", id: "Tekanan ringan – lembut dan menenangkan." },
  pressureDescMedium: { pl: "Średni nacisk – zrównoważony i relaksujący.", en: "Medium pressure – balanced and relaxing.", uk: "Середній тиск – збалансований і розслаблюючий.", it: "Pressione media – equilibrata e rilassante.", fr: "Pression moyenne – équilibrée et relaxante.", de: "Mittlerer Druck – ausgewogen und entspannend.", es: "Presión media – equilibrada y relajante.", id: "Tekanan sedang – seimbang dan menenangkan." },
  pressureDescFirm: { pl: "Mocny nacisk – intensywny i pobudzający krążenie.", en: "Firm pressure – intense and circulation-boosting.", uk: "Сильний тиск – інтенсивний і стимулює кровообіг.", it: "Pressione forte – intensa e stimolante per la circolazione.", fr: "Pression ferme – intense et stimulant la circulation.", de: "Kräftiger Druck – intensiv und durchblutungsfördernd.", es: "Presión fuerte – intensa y estimulante de la circulación.", id: "Tekanan kuat – intens dan melancarkan sirkulasi." },
  pressureDescDeep: { pl: "Głęboki nacisk – praca na głębokich warstwach mięśni.", en: "Deep pressure – working the deep muscle layers.", uk: "Глибокий тиск – робота з глибокими шарами м'язів.", it: "Pressione profonda – lavoro sugli strati muscolari profondi.", fr: "Pression profonde – travail des couches musculaires profondes.", de: "Tiefer Druck – Arbeit an den tiefen Muskelschichten.", es: "Presión profunda – trabajo en las capas musculares profundas.", id: "Tekanan dalam – mengerjakan lapisan otot dalam." },

  // GuestHandoffStep
  guestHandoffTitle: { pl: "Dziękujemy, {finished}! Kolejna osoba: {next}.", en: "Thank you, {finished}! Next person: {next}.", uk: "Дякуємо, {finished}! Наступна особа: {next}.", it: "Grazie, {finished}! Prossima persona: {next}.", fr: "Merci, {finished} ! Personne suivante : {next}.", de: "Danke, {finished}! Nächste Person: {next}.", es: "¡Gracias, {finished}! Siguiente persona: {next}.", id: "Terima kasih, {finished}! Orang berikutnya: {next}." },
  guestHandoffBody: { pl: "{next}, przekazujemy Ci tablet — możesz teraz zaznaczyć swoje obszary pracy i dopasować własne preferencje.", en: "{next}, we're handing you the tablet — you can now mark your work areas and adjust your own preferences.", uk: "{next}, передаємо вам планшет — тепер ви можете позначити свої зони роботи та налаштувати власні побажання.", it: "{next}, ti passiamo il tablet — ora puoi segnare le tue aree di lavoro e regolare le tue preferenze.", fr: "{next}, nous vous remettons la tablette — vous pouvez maintenant marquer vos zones de travail et ajuster vos préférences.", de: "{next}, wir übergeben Ihnen das Tablet — Sie können nun Ihre Arbeitsbereiche markieren und Ihre eigenen Vorlieben anpassen.", es: "{next}, le entregamos la tableta — ahora puede marcar sus áreas de trabajo y ajustar sus propias preferencias.", id: "{next}, kami serahkan tablet kepada Anda — sekarang Anda dapat menandai area kerja dan menyesuaikan preferensi Anda." },
  firstPerson: { pl: "Pierwsza osoba", en: "First person", uk: "Перша особа", it: "Prima persona", fr: "Première personne", de: "Erste Person", es: "Primera persona", id: "Orang pertama" },
  secondPerson: { pl: "Druga osoba", en: "Second person", uk: "Друга особа", it: "Seconda persona", fr: "Deuxième personne", de: "Zweite Person", es: "Segunda persona", id: "Orang kedua" },

  // HandoffStep
  thanksName: { pl: "Dziękujemy, {name}.", en: "Thank you, {name}.", uk: "Дякуємо, {name}.", it: "Grazie, {name}.", fr: "Merci, {name}.", de: "Danke, {name}.", es: "Gracias, {name}.", id: "Terima kasih, {name}." },
  prefsSavedCouple: { pl: "Wasze preferencje zostały zapisane.", en: "Your preferences have been saved.", uk: "Ваші побажання збережено.", it: "Le vostre preferenze sono state salvate.", fr: "Vos préférences ont été enregistrées.", de: "Ihre Vorlieben wurden gespeichert.", es: "Sus preferencias se han guardado.", id: "Preferensi Anda telah disimpan." },
  prefsSavedSingle: { pl: "Twoje preferencje zostały zapisane.", en: "Your preferences have been saved.", uk: "Ваші побажання збережено.", it: "Le tue preferenze sono state salvate.", fr: "Vos préférences ont été enregistrées.", de: "Ihre Vorlieben wurden gespeichert.", es: "Sus preferencias se han guardado.", id: "Preferensi Anda telah disimpan." },
  passTablet: { pl: "Prosimy o przekazanie tabletu recepcjonistce lub masażyście.", en: "Please hand the tablet to the receptionist or therapist.", uk: "Будь ласка, передайте планшет адміністратору або масажисту.", it: "Si prega di consegnare il tablet alla reception o al massaggiatore.", fr: "Veuillez remettre la tablette à la réception ou au masseur.", de: "Bitte geben Sie das Tablet an die Rezeption oder den Therapeuten.", es: "Por favor, entregue la tableta a la recepcionista o al masajista.", id: "Silakan serahkan tablet kepada resepsionis atau terapis." },

  // MasseurDashboard
  differentTreatments: { pl: "Różne zabiegi", en: "Different treatments", uk: "Різні догляди", it: "Trattamenti diversi", fr: "Soins différents", de: "Unterschiedliche Behandlungen", es: "Tratamientos diferentes", id: "Perawatan berbeda" },

  // guestName fallbacks
  guestVocative: { pl: "Gościu", en: "Guest", uk: "Гостю", it: "Ospite", fr: "Cher invité", de: "Lieber Gast", es: "Estimado huésped", id: "Tamu" },
  nameAnd: { pl: "i", en: "and", uk: "та", it: "e", fr: "et", de: "und", es: "y", id: "dan" },

  // Auth (LoginPage) + shared dashboard chrome
  staffSignIn: { pl: "Logowanie personelu", en: "Staff sign in", uk: "Вхід для персоналу", it: "Accesso staff", fr: "Connexion du personnel", de: "Mitarbeiter-Anmeldung", es: "Acceso del personal", id: "Masuk staf" },
  email: { pl: "E-mail", en: "Email", uk: "Електронна пошта", it: "Email", fr: "E-mail", de: "E-Mail", es: "Correo electrónico", id: "Email" },
  password: { pl: "Hasło", en: "Password", uk: "Пароль", it: "Password", fr: "Mot de passe", de: "Passwort", es: "Contraseña", id: "Kata sandi" },
  signIn: { pl: "Zaloguj się", en: "Sign in", uk: "Увійти", it: "Accedi", fr: "Se connecter", de: "Anmelden", es: "Iniciar sesión", id: "Masuk" },
  signingIn: { pl: "Logowanie…", en: "Signing in…", uk: "Вхід…", it: "Accesso…", fr: "Connexion…", de: "Anmeldung…", es: "Iniciando sesión…", id: "Masuk…" },
  signInFailed: { pl: "Logowanie nie powiodło się.", en: "Sign-in failed.", uk: "Не вдалося увійти.", it: "Accesso non riuscito.", fr: "Échec de la connexion.", de: "Anmeldung fehlgeschlagen.", es: "Error al iniciar sesión.", id: "Gagal masuk." },
  signOut: { pl: "Wyloguj się", en: "Sign out", uk: "Вийти", it: "Esci", fr: "Se déconnecter", de: "Abmelden", es: "Cerrar sesión", id: "Keluar" },
  save: { pl: "Zapisz", en: "Save", uk: "Зберегти", it: "Salva", fr: "Enregistrer", de: "Speichern", es: "Guardar", id: "Simpan" },
  saving: { pl: "Zapisywanie…", en: "Saving…", uk: "Збереження…", it: "Salvataggio…", fr: "Enregistrement…", de: "Speichern…", es: "Guardando…", id: "Menyimpan…" },
  loading: { pl: "Ładowanie…", en: "Loading…", uk: "Завантаження…", it: "Caricamento…", fr: "Chargement…", de: "Laden…", es: "Cargando…", id: "Memuat…" },

  // Offer CMS (/manage)
  offer: { pl: "Oferta", en: "Offer", uk: "Пропозиція", it: "Offerta", fr: "Offre", de: "Angebot", es: "Oferta", id: "Penawaran" },
  cmsNoLocations: { pl: "Nie masz jeszcze żadnych lokalizacji do zarządzania. Utwórz jedną w panelu administratora platformy.", en: "No locations you can manage yet. Create one from the Platform Admin dashboard.", uk: "У вас ще немає локацій для керування. Створіть її в панелі адміністратора платформи.", it: "Non hai ancora sedi da gestire. Creane una dal pannello dell'amministratore della piattaforma.", fr: "Vous n'avez pas encore d'établissements à gérer. Créez-en un depuis le tableau de bord de l'administrateur.", de: "Sie haben noch keine Standorte zu verwalten. Erstellen Sie einen im Plattform-Admin-Dashboard.", es: "Aún no tienes ubicaciones que gestionar. Crea una desde el panel de administrador de la plataforma.", id: "Belum ada lokasi yang dapat Anda kelola. Buat satu dari dasbor admin platform." },
  locationLabel: { pl: "Lokalizacja", en: "Location", uk: "Локація", it: "Sede", fr: "Établissement", de: "Standort", es: "Ubicación", id: "Lokasi" },
  cmsNoServices: { pl: "Ta lokalizacja nie ma jeszcze żadnych usług.", en: "This location has no services yet.", uk: "У цій локації ще немає послуг.", it: "Questa sede non ha ancora servizi.", fr: "Cet établissement n'a pas encore de services.", de: "Dieser Standort hat noch keine Leistungen.", es: "Esta ubicación aún no tiene servicios.", id: "Lokasi ini belum memiliki layanan." },
  cmsImport: { pl: "Importuj katalog Nusa", en: "Import Nusa catalogue", uk: "Імпортувати каталог Nusa", it: "Importa catalogo Nusa", fr: "Importer le catalogue Nusa", de: "Nusa-Katalog importieren", es: "Importar catálogo Nusa", id: "Impor katalog Nusa" },
  cmsImporting: { pl: "Importowanie…", en: "Importing…", uk: "Імпортування…", it: "Importazione…", fr: "Importation…", de: "Importieren…", es: "Importando…", id: "Mengimpor…" },
  cmsAddBlank: { pl: "Dodaj pustą usługę", en: "Add blank service", uk: "Додати порожню послугу", it: "Aggiungi servizio vuoto", fr: "Ajouter un service vierge", de: "Leere Leistung hinzufügen", es: "Añadir servicio en blanco", id: "Tambah layanan kosong" },
  cmsAddService: { pl: "Dodaj usługę", en: "Add service", uk: "Додати послугу", it: "Aggiungi servizio", fr: "Ajouter un service", de: "Leistung hinzufügen", es: "Añadir servicio", id: "Tambah layanan" },
  cmsName: { pl: "Nazwa", en: "Name", uk: "Назва", it: "Nome", fr: "Nom", de: "Name", es: "Nombre", id: "Nama" },
  cmsNameRequired: { pl: "Nazwa po polsku jest wymagana.", en: "The Polish name is required.", uk: "Назва польською обов'язкова.", it: "Il nome in polacco è obbligatorio.", fr: "Le nom en polonais est obligatoire.", de: "Der polnische Name ist erforderlich.", es: "El nombre en polaco es obligatorio.", id: "Nama dalam bahasa Polandia wajib diisi." },
  cmsAddTranslations: { pl: "Dodaj tłumaczenia", en: "Add translations", uk: "Додати переклади", it: "Aggiungi traduzioni", fr: "Ajouter des traductions", de: "Übersetzungen hinzufügen", es: "Añadir traducciones", id: "Tambah terjemahan" },
  cmsHideTranslations: { pl: "Ukryj tłumaczenia", en: "Hide translations", uk: "Сховати переклади", it: "Nascondi traduzioni", fr: "Masquer les traductions", de: "Übersetzungen ausblenden", es: "Ocultar traducciones", id: "Sembunyikan terjemahan" },
  cmsFallbackNote: { pl: "Puste pola przyjmą nazwę polską.", en: "Empty fields fall back to the Polish name.", uk: "Порожні поля використають польську назву.", it: "I campi vuoti useranno il nome polacco.", fr: "Les champs vides utiliseront le nom polonais.", de: "Leere Felder verwenden den polnischen Namen.", es: "Los campos vacíos usarán el nombre polaco.", id: "Bidang kosong akan memakai nama Polandia." },
  cmsDurations: { pl: "Czasy trwania", en: "Durations", uk: "Тривалість", it: "Durate", fr: "Durées", de: "Dauer", es: "Duraciones", id: "Durasi" },
  cmsMin: { pl: "Min", en: "Min", uk: "Хв", it: "Min", fr: "Min", de: "Min", es: "Min", id: "Mnt" },
  cmsPriceSingle: { pl: "Jedna os. (zł)", en: "Single (zł)", uk: "Одна ос. (zł)", it: "Singola (zł)", fr: "Une pers. (zł)", de: "Einzel (zł)", es: "Individual (zł)", id: "Satu (zł)" },
  cmsPriceCouple: { pl: "Para (zł)", en: "Couple (zł)", uk: "Пара (zł)", it: "Coppia (zł)", fr: "Couple (zł)", de: "Paar (zł)", es: "Pareja (zł)", id: "Pasangan (zł)" },
  cmsCoupleShort: { pl: "para", en: "couple", uk: "пара", it: "coppia", fr: "couple", de: "Paar", es: "pareja", id: "pasangan" },
  cmsRemove: { pl: "usuń", en: "remove", uk: "видалити", it: "rimuovi", fr: "retirer", de: "entfernen", es: "quitar", id: "hapus" },
  cmsAddDuration: { pl: "dodaj czas trwania", en: "add duration", uk: "додати тривалість", it: "aggiungi durata", fr: "ajouter une durée", de: "Dauer hinzufügen", es: "añadir duración", id: "tambah durasi" },
  cmsActive: { pl: "Aktywna", en: "Active", uk: "Активна", it: "Attiva", fr: "Actif", de: "Aktiv", es: "Activo", id: "Aktif" },
  cmsDelete: { pl: "Usuń", en: "Delete", uk: "Видалити", it: "Elimina", fr: "Supprimer", de: "Löschen", es: "Eliminar", id: "Hapus" },
  cmsDeleteConfirm: { pl: "Usunąć '{name}'? Tej operacji nie można cofnąć.", en: "Delete '{name}'? This cannot be undone.", uk: "Видалити '{name}'? Цю дію не можна скасувати.", it: "Eliminare '{name}'? L'operazione non può essere annullata.", fr: "Supprimer '{name}' ? Cette action est irréversible.", de: "'{name}' löschen? Dies kann nicht rückgängig gemacht werden.", es: "¿Eliminar '{name}'? Esto no se puede deshacer.", id: "Hapus '{name}'? Ini tidak dapat dibatalkan." },

  // Intake save (kiosk handoff)
  intakeSaveFailed: { pl: "Nie udało się zapisać wizyty w systemie — przekaż preferencje masażyście ustnie.", en: "Couldn't save the visit to the system — pass the preferences to the therapist in person.", uk: "Не вдалося зберегти візит у системі — передайте побажання масажисту особисто.", it: "Impossibile salvare la visita nel sistema — comunica le preferenze al massaggiatore di persona.", fr: "Impossible d'enregistrer la visite — transmettez les préférences au masseur en personne.", de: "Der Besuch konnte nicht gespeichert werden — geben Sie die Vorlieben dem Therapeuten persönlich weiter.", es: "No se pudo guardar la visita en el sistema — comunique las preferencias al masajista en persona.", id: "Gagal menyimpan kunjungan ke sistem — sampaikan preferensi ke terapis secara langsung." },

  // Therapist queue
  queueTitle: { pl: "Kolejka wizyt", en: "Visit queue", uk: "Черга візитів", it: "Coda delle visite", fr: "File d'attente des visites", de: "Besuchs-Warteschlange", es: "Cola de visitas", id: "Antrean kunjungan" },
  queueEmpty: { pl: "Brak wizyt w kolejce.", en: "No visits in the queue.", uk: "У черзі немає візитів.", it: "Nessuna visita in coda.", fr: "Aucune visite dans la file.", de: "Keine Besuche in der Warteschlange.", es: "No hay visitas en la cola.", id: "Tidak ada kunjungan dalam antrean." },
  queueError: { pl: "Nie udało się wczytać kolejki.", en: "Couldn't load the queue.", uk: "Не вдалося завантажити чергу.", it: "Impossibile caricare la coda.", fr: "Impossible de charger la file.", de: "Warteschlange konnte nicht geladen werden.", es: "No se pudo cargar la cola.", id: "Gagal memuat antrean." },
  queueRefresh: { pl: "Odśwież", en: "Refresh", uk: "Оновити", it: "Aggiorna", fr: "Actualiser", de: "Aktualisieren", es: "Actualizar", id: "Segarkan" },
  queueBack: { pl: "Wróć do kolejki", en: "Back to queue", uk: "Назад до черги", it: "Torna alla coda", fr: "Retour à la file", de: "Zurück zur Warteschlange", es: "Volver a la cola", id: "Kembali ke antrean" },
  queueOpen: { pl: "Otwórz", en: "Open", uk: "Відкрити", it: "Apri", fr: "Ouvrir", de: "Öffnen", es: "Abrir", id: "Buka" },
  queueMarkDone: { pl: "Oznacz jako zakończone", en: "Mark as done", uk: "Позначити виконаним", it: "Segna come completata", fr: "Marquer comme terminée", de: "Als erledigt markieren", es: "Marcar como hecha", id: "Tandai selesai" },
  queueReopen: { pl: "Przywróć do kolejki", en: "Reopen", uk: "Повернути в чергу", it: "Riapri", fr: "Rouvrir", de: "Wieder öffnen", es: "Reabrir", id: "Buka kembali" },
  queueStatusSubmitted: { pl: "Zgłoszona", en: "Submitted", uk: "Подана", it: "Inviata", fr: "Soumise", de: "Eingereicht", es: "Enviada", id: "Terkirim" },
  queueStatusDone: { pl: "Zakończona", en: "Done", uk: "Завершена", it: "Completata", fr: "Terminée", de: "Erledigt", es: "Hecha", id: "Selesai" },
  queueNav: { pl: "Kolejka", en: "Queue", uk: "Черга", it: "Coda", fr: "File", de: "Warteschlange", es: "Cola", id: "Antrean" },

  // Staff management
  staffTitle: { pl: "Zarządzanie personelem", en: "Staff management", uk: "Керування персоналом", it: "Gestione del personale", fr: "Gestion du personnel", de: "Personalverwaltung", es: "Gestión del personal", id: "Manajemen staf" },
  staffNav: { pl: "Personel", en: "Staff", uk: "Персонал", it: "Personale", fr: "Personnel", de: "Personal", es: "Personal", id: "Staf" },
  staffAccountLabel: { pl: "Konto", en: "Account", uk: "Обліковий запис", it: "Account", fr: "Compte", de: "Konto", es: "Cuenta", id: "Akun" },
  staffNoAccounts: { pl: "Brak kont, którymi możesz zarządzać.", en: "No accounts you can manage.", uk: "Немає облікових записів для керування.", it: "Nessun account che puoi gestire.", fr: "Aucun compte que vous pouvez gérer.", de: "Keine verwaltbaren Konten.", es: "No hay cuentas que puedas gestionar.", id: "Tidak ada akun yang bisa Anda kelola." },
  staffMembers: { pl: "Członkowie", en: "Members", uk: "Учасники", it: "Membri", fr: "Membres", de: "Mitglieder", es: "Miembros", id: "Anggota" },
  staffNoMembers: { pl: "Brak członków.", en: "No members yet.", uk: "Ще немає учасників.", it: "Ancora nessun membro.", fr: "Aucun membre pour l'instant.", de: "Noch keine Mitglieder.", es: "Aún no hay miembros.", id: "Belum ada anggota." },
  staffInvite: { pl: "Zaproś członka", en: "Invite member", uk: "Запросити учасника", it: "Invita un membro", fr: "Inviter un membre", de: "Mitglied einladen", es: "Invitar miembro", id: "Undang anggota" },
  staffEmail: { pl: "E-mail", en: "Email", uk: "Електронна пошта", it: "E-mail", fr: "E-mail", de: "E-Mail", es: "Correo electrónico", id: "Email" },
  staffRole: { pl: "Rola", en: "Role", uk: "Роль", it: "Ruolo", fr: "Rôle", de: "Rolle", es: "Rol", id: "Peran" },
  staffLocationAll: { pl: "Całe konto", en: "Account-wide", uk: "Весь обліковий запис", it: "Tutto l'account", fr: "Tout le compte", de: "Kontoweit", es: "Toda la cuenta", id: "Seluruh akun" },
  staffAdd: { pl: "Zaproś", en: "Invite", uk: "Запросити", it: "Invita", fr: "Inviter", de: "Einladen", es: "Invitar", id: "Undang" },
  staffInviting: { pl: "Zapraszanie…", en: "Inviting…", uk: "Запрошення…", it: "Invito in corso…", fr: "Invitation…", de: "Einladen…", es: "Invitando…", id: "Mengundang…" },
  staffRemove: { pl: "Usuń", en: "Remove", uk: "Видалити", it: "Rimuovi", fr: "Retirer", de: "Entfernen", es: "Quitar", id: "Hapus" },
  staffRemoveConfirm: { pl: "Usunąć członka {email}?", en: "Remove {email}?", uk: "Видалити учасника {email}?", it: "Rimuovere {email}?", fr: "Retirer {email} ?", de: "{email} entfernen?", es: "¿Quitar a {email}?", id: "Hapus {email}?" },
  staffAdded: { pl: "Dodano członka.", en: "Member added.", uk: "Учасника додано.", it: "Membro aggiunto.", fr: "Membre ajouté.", de: "Mitglied hinzugefügt.", es: "Miembro añadido.", id: "Anggota ditambahkan." },
  staffAlreadyMember: { pl: "Ta osoba jest już członkiem.", en: "This person is already a member.", uk: "Ця особа вже є учасником.", it: "Questa persona è già un membro.", fr: "Cette personne est déjà membre.", de: "Diese Person ist bereits Mitglied.", es: "Esta persona ya es miembro.", id: "Orang ini sudah menjadi anggota." },
  staffInviteLinkNote: { pl: "Nowy członek — przekaż mu ten link, aby ustawił hasło:", en: "New member — send them this link to set their password:", uk: "Новий учасник — надішліть це посилання для встановлення пароля:", it: "Nuovo membro — inviagli questo link per impostare la password:", fr: "Nouveau membre — envoyez-lui ce lien pour définir son mot de passe :", de: "Neues Mitglied — senden Sie ihm diesen Link zum Festlegen des Passworts:", es: "Nuevo miembro — envíale este enlace para establecer su contraseña:", id: "Anggota baru — kirim tautan ini untuk mengatur kata sandi:" },
  staffCopy: { pl: "Kopiuj", en: "Copy", uk: "Копіювати", it: "Copia", fr: "Copier", de: "Kopieren", es: "Copiar", id: "Salin" },
  staffCopied: { pl: "Skopiowano", en: "Copied", uk: "Скопійовано", it: "Copiato", fr: "Copié", de: "Kopiert", es: "Copiado", id: "Disalin" },
  roleOwner: { pl: "Właściciel", en: "Owner", uk: "Власник", it: "Titolare", fr: "Propriétaire", de: "Inhaber", es: "Propietario", id: "Pemilik" },
  roleManager: { pl: "Menedżer", en: "Manager", uk: "Менеджер", it: "Manager", fr: "Gérant", de: "Manager", es: "Gerente", id: "Manajer" },
  roleTherapist: { pl: "Masażysta", en: "Therapist", uk: "Масажист", it: "Massaggiatore", fr: "Masseur", de: "Therapeut", es: "Masajista", id: "Terapis" },
  roleFrontdesk: { pl: "Recepcja", en: "Front desk", uk: "Ресепшн", it: "Reception", fr: "Réception", de: "Empfang", es: "Recepción", id: "Resepsionis" },
  staffName: { pl: "Imię i nazwisko", en: "Full name", uk: "Ім'я та прізвище", it: "Nome e cognome", fr: "Nom complet", de: "Vor- und Nachname", es: "Nombre completo", id: "Nama lengkap" },
  staffPhone: { pl: "Telefon", en: "Phone", uk: "Телефон", it: "Telefono", fr: "Téléphone", de: "Telefon", es: "Teléfono", id: "Telepon" },
  staffEdit: { pl: "Edytuj", en: "Edit", uk: "Редагувати", it: "Modifica", fr: "Modifier", de: "Bearbeiten", es: "Editar", id: "Ubah" },
  staffCancel: { pl: "Anuluj", en: "Cancel", uk: "Скасувати", it: "Annulla", fr: "Annuler", de: "Abbrechen", es: "Cancelar", id: "Batal" },
  staffUpdated: { pl: "Zapisano zmiany.", en: "Changes saved.", uk: "Зміни збережено.", it: "Modifiche salvate.", fr: "Modifications enregistrées.", de: "Änderungen gespeichert.", es: "Cambios guardados.", id: "Perubahan disimpan." },
  staffNeedLocationFirst: { pl: "Najpierw utwórz lokalizację, aby dodać personel.", en: "Create a location first to add staff.", uk: "Спочатку створіть локацію, щоб додати персонал.", it: "Crea prima una sede per aggiungere il personale.", fr: "Créez d'abord un lieu pour ajouter du personnel.", de: "Erstellen Sie zuerst einen Standort, um Personal hinzuzufügen.", es: "Crea primero una ubicación para añadir personal.", id: "Buat lokasi dulu untuk menambahkan staf." },
  // Accept-invite / set-password page (/welcome)
  welcomePwTitle: { pl: "Ustaw hasło", en: "Set your password", uk: "Встановіть пароль", it: "Imposta la password", fr: "Définissez votre mot de passe", de: "Passwort festlegen", es: "Establece tu contraseña", id: "Atur kata sandi" },
  welcomeSubtitle: { pl: "Wybierz hasło, aby aktywować konto.", en: "Choose a password to activate your account.", uk: "Виберіть пароль, щоб активувати обліковий запис.", it: "Scegli una password per attivare il tuo account.", fr: "Choisissez un mot de passe pour activer votre compte.", de: "Wählen Sie ein Passwort, um Ihr Konto zu aktivieren.", es: "Elige una contraseña para activar tu cuenta.", id: "Pilih kata sandi untuk mengaktifkan akun Anda." },
  welcomeConfirm: { pl: "Potwierdź hasło", en: "Confirm password", uk: "Підтвердіть пароль", it: "Conferma la password", fr: "Confirmez le mot de passe", de: "Passwort bestätigen", es: "Confirma la contraseña", id: "Konfirmasi kata sandi" },
  welcomeSubmit: { pl: "Ustaw hasło i kontynuuj", en: "Set password & continue", uk: "Встановити пароль і продовжити", it: "Imposta la password e continua", fr: "Définir le mot de passe et continuer", de: "Passwort festlegen und fortfahren", es: "Establecer contraseña y continuar", id: "Atur kata sandi & lanjutkan" },
  welcomeSubmitting: { pl: "Zapisywanie…", en: "Saving…", uk: "Збереження…", it: "Salvataggio…", fr: "Enregistrement…", de: "Speichern…", es: "Guardando…", id: "Menyimpan…" },
  welcomeDone: { pl: "Hasło ustawione. Przekierowywanie…", en: "Password set. Redirecting…", uk: "Пароль встановлено. Переадресація…", it: "Password impostata. Reindirizzamento…", fr: "Mot de passe défini. Redirection…", de: "Passwort festgelegt. Weiterleitung…", es: "Contraseña establecida. Redirigiendo…", id: "Kata sandi diatur. Mengalihkan…" },
  welcomePwShort: { pl: "Hasło musi mieć co najmniej 8 znaków.", en: "Password must be at least 8 characters.", uk: "Пароль має містити щонайменше 8 символів.", it: "La password deve contenere almeno 8 caratteri.", fr: "Le mot de passe doit comporter au moins 8 caractères.", de: "Das Passwort muss mindestens 8 Zeichen lang sein.", es: "La contraseña debe tener al menos 8 caracteres.", id: "Kata sandi harus minimal 8 karakter." },
  welcomePwMismatch: { pl: "Hasła nie są zgodne.", en: "Passwords don't match.", uk: "Паролі не збігаються.", it: "Le password non corrispondono.", fr: "Les mots de passe ne correspondent pas.", de: "Die Passwörter stimmen nicht überein.", es: "Las contraseñas no coinciden.", id: "Kata sandi tidak cocok." },
  welcomeInvalidLink: { pl: "Ten link zaproszenia jest nieprawidłowy lub wygasł. Poproś menedżera o nowy.", en: "This invite link is invalid or has expired. Ask your manager for a new one.", uk: "Це посилання-запрошення недійсне або застаріле. Попросіть менеджера надіслати нове.", it: "Questo link di invito non è valido o è scaduto. Chiedi al tuo manager un nuovo link.", fr: "Ce lien d'invitation est invalide ou a expiré. Demandez-en un nouveau à votre responsable.", de: "Dieser Einladungslink ist ungültig oder abgelaufen. Bitten Sie Ihren Manager um einen neuen.", es: "Este enlace de invitación no es válido o ha caducado. Pide uno nuevo a tu responsable.", id: "Tautan undangan ini tidak valid atau kedaluwarsa. Minta yang baru dari manajer Anda." },
  welcomeActivating: { pl: "Aktywowanie konta…", en: "Activating your account…", uk: "Активація облікового запису…", it: "Attivazione dell'account…", fr: "Activation de votre compte…", de: "Konto wird aktiviert…", es: "Activando tu cuenta…", id: "Mengaktifkan akun Anda…" },
};

export const zoneTranslations: Record<ZoneId, Dict> = {
  scalp: { pl: "Głowa (skóra głowy)", en: "Scalp", uk: "Шкіра голови", it: "Cuoio capelluto", fr: "Cuir chevelu", de: "Kopfhaut", es: "Cuero cabelludo", id: "Kulit kepala" },
  face: { pl: "Twarz", en: "Face", uk: "Обличчя", it: "Viso", fr: "Visage", de: "Gesicht", es: "Rostro", id: "Wajah" },
  decolletage: { pl: "Dekolt", en: "Décolletage", uk: "Декольте", it: "Décolleté", fr: "Décolleté", de: "Dekolleté", es: "Escote", id: "Dada atas" },
  chest: { pl: "Klatka piersiowa", en: "Chest", uk: "Грудна клітка", it: "Petto", fr: "Poitrine", de: "Brust", es: "Pecho", id: "Dada" },
  abdomen: { pl: "Brzuch", en: "Abdomen", uk: "Живіт", it: "Addome", fr: "Abdomen", de: "Bauch", es: "Abdomen", id: "Perut" },
  upperArmsFront: { pl: "Ramiona", en: "Upper arm (front)", uk: "Плече (перед)", it: "Braccio (davanti)", fr: "Bras (avant)", de: "Oberarm (vorne)", es: "Brazo (frente)", id: "Lengan atas (depan)" },
  forearmsFront: { pl: "Przedramiona", en: "Forearm (front)", uk: "Передпліччя (перед)", it: "Avambraccio (davanti)", fr: "Avant-bras (avant)", de: "Unterarm (vorne)", es: "Antebrazo (frente)", id: "Lengan bawah (depan)" },
  hands: { pl: "Dłonie", en: "Hands", uk: "Кисті рук", it: "Mani", fr: "Mains", de: "Hände", es: "Manos", id: "Tangan" },
  thighsFront: { pl: "Uda", en: "Thigh (front)", uk: "Стегно (перед)", it: "Coscia (davanti)", fr: "Cuisse (avant)", de: "Oberschenkel (vorne)", es: "Muslo (frente)", id: "Paha (depan)" },
  shins: { pl: "Podudzia / Golenie", en: "Shin", uk: "Гомілка (перед)", it: "Stinco", fr: "Tibia", de: "Schienbein", es: "Espinilla", id: "Tulang kering" },
  feetTop: { pl: "Stopy (wierzch)", en: "Foot (top)", uk: "Стопа (верх)", it: "Piede (dorso)", fr: "Pied (dessus)", de: "Fuß (oben)", es: "Pie (empeine)", id: "Kaki (punggung)" },
  nape: { pl: "Kark", en: "Nape", uk: "Потилиця", it: "Nuca", fr: "Nuque", de: "Nacken", es: "Nuca", id: "Tengkuk" },
  shoulders: { pl: "Barki", en: "Shoulders", uk: "Плечі", it: "Spalle", fr: "Épaules", de: "Schultern", es: "Hombros", id: "Bahu" },
  upperBack: { pl: "Górny grzbiet", en: "Upper back", uk: "Верх спини", it: "Schiena alta", fr: "Haut du dos", de: "Oberer Rücken", es: "Espalda alta", id: "Punggung atas" },
  lowerBack: { pl: "Dolny grzbiet", en: "Lower back", uk: "Низ спини", it: "Schiena bassa", fr: "Bas du dos", de: "Unterer Rücken", es: "Espalda baja", id: "Punggung bawah" },
  upperArmsBack: { pl: "Ramiona (tył)", en: "Upper arm (back)", uk: "Плече (зад)", it: "Braccio (dietro)", fr: "Bras (arrière)", de: "Oberarm (hinten)", es: "Brazo (espalda)", id: "Lengan atas (belakang)" },
  forearmsBack: { pl: "Przedramiona (tył)", en: "Forearm (back)", uk: "Передпліччя (зад)", it: "Avambraccio (dietro)", fr: "Avant-bras (arrière)", de: "Unterarm (hinten)", es: "Antebrazo (espalda)", id: "Lengan bawah (belakang)" },
  glutes: { pl: "Pośladki", en: "Glutes", uk: "Сідниці", it: "Glutei", fr: "Fessiers", de: "Gesäß", es: "Glúteos", id: "Bokong" },
  thighsBack: { pl: "Uda (tył)", en: "Thigh (back)", uk: "Стегно (зад)", it: "Coscia (dietro)", fr: "Cuisse (arrière)", de: "Oberschenkel (hinten)", es: "Muslo (espalda)", id: "Paha (belakang)" },
  calves: { pl: "Łydki", en: "Calf", uk: "Литка", it: "Polpaccio", fr: "Mollet", de: "Wade", es: "Pantorrilla", id: "Betis" },
  feetSole: { pl: "Stopy (podeszwa)", en: "Foot (sole)", uk: "Стопа (підошва)", it: "Pianta del piede", fr: "Plante du pied", de: "Fußsohle", es: "Planta del pie", id: "Telapak kaki" },
};

export const massageNameTranslations: Record<string, Dict> = {
  tajski: { pl: "Masaż Tajski", en: "Thai Massage", uk: "Тайський масаж", it: "Massaggio Thailandese", fr: "Massage Thaïlandais", de: "Thai-Massage", es: "Masaje Tailandés", id: "Pijat Thailand" },
  balijski: { pl: "Masaż Balijski", en: "Balinese Massage", uk: "Балійський масаж", it: "Massaggio Balinese", fr: "Massage Balinais", de: "Balinesische Massage", es: "Masaje Balinés", id: "Pijat Bali" },
  "balijski-cieplymi-olejkami": { pl: "Masaż Balijski Ciepłymi Olejkami", en: "Balinese Massage with Warm Oils", uk: "Балійський масаж теплими оліями", it: "Massaggio Balinese con Oli Caldi", fr: "Massage Balinais aux Huiles Chaudes", de: "Balinesische Massage mit warmen Ölen", es: "Masaje Balinés con Aceites Calientes", id: "Pijat Bali dengan Minyak Hangat" },
  "balijski-maslo-shea": { pl: "Masaż Balijski z Masłem Shea", en: "Balinese Massage with Shea Butter", uk: "Балійський масаж з маслом ши", it: "Massaggio Balinese al Burro di Karité", fr: "Massage Balinais au Beurre de Karité", de: "Balinesische Massage mit Sheabutter", es: "Masaje Balinés con Manteca de Karité", id: "Pijat Bali dengan Shea Butter" },
  "balijski-mocny": { pl: "Masaż Balijski Mocny (Sportowy)", en: "Deep Balinese Massage (Sport)", uk: "Сильний балійський масаж (спортивний)", it: "Massaggio Balinese Intenso (Sportivo)", fr: "Massage Balinais Intense (Sportif)", de: "Intensive Balinesische Massage (Sport)", es: "Masaje Balinés Intenso (Deportivo)", id: "Pijat Bali Kuat (Olahraga)" },
  "lomi-lomi": { pl: "Masaż Lomi Lomi", en: "Lomi Lomi Massage", uk: "Масаж Ломі-Ломі", it: "Massaggio Lomi Lomi", fr: "Massage Lomi Lomi", de: "Lomi-Lomi-Massage", es: "Masaje Lomi Lomi", id: "Pijat Lomi Lomi" },
  "bambusem-relaksacyjny": { pl: "Relaksacyjny Masaż Bambusem", en: "Relaxing Bamboo Massage", uk: "Розслаблюючий бамбуковий масаж", it: "Massaggio Rilassante al Bambù", fr: "Massage Relaxant au Bambou", de: "Entspannende Bambusmassage", es: "Masaje Relajante con Bambú", id: "Pijat Bambu Relaksasi" },
  "bambusem-antycellulitowy": { pl: "Antycellulitowy Masaż Bambusem", en: "Anti-Cellulite Bamboo Massage", uk: "Антицелюлітний бамбуковий масаж", it: "Massaggio Anticellulite al Bambù", fr: "Massage Anticellulite au Bambou", de: "Anti-Cellulite-Bambusmassage", es: "Masaje Anticelulítico con Bambú", id: "Pijat Bambu Anti-Selulit" },
  "gornej-czesci-ciala": { pl: "Masaż Górnej Części Ciała", en: "Upper Body Massage", uk: "Масаж верхньої частини тіла", it: "Massaggio Parte Superiore del Corpo", fr: "Massage du Haut du Corps", de: "Oberkörper-Massage", es: "Masaje de la Parte Superior del Cuerpo", id: "Pijat Tubuh Bagian Atas" },
  "stop-refleksologia": { pl: "Masaż Stóp z Refleksologią", en: "Foot Massage with Reflexology", uk: "Масаж стоп з рефлексологією", it: "Massaggio Plantare con Riflessologia", fr: "Massage des Pieds avec Réflexologie", de: "Fußmassage mit Reflexzonen", es: "Masaje de Pies con Reflexología", id: "Pijat Kaki dengan Refleksologi" },
  "twarzy-arganowy": { pl: "Odmładzający Masaż Twarzy Olejkiem Arganowym", en: "Rejuvenating Facial Massage with Argan Oil", uk: "Омолоджувальний масаж обличчя з аргановою олією", it: "Massaggio Viso Ringiovanente all'Olio di Argan", fr: "Massage Visage Rajeunissant à l'Huile d'Argan", de: "Verjüngende Gesichtsmassage mit Arganöl", es: "Masaje Facial Rejuvenecedor con Aceite de Argán", id: "Pijat Wajah Peremajaan dengan Minyak Argan" },
  "twarzy-liftingujacy": { pl: "Nusa Liftingujący Masaż Twarzy", en: "Nusa Face-Lifting Massage", uk: "Ліфтинговий масаж обличчя Nusa", it: "Massaggio Viso Liftante Nusa", fr: "Massage Visage Liftant Nusa", de: "Nusa Lifting-Gesichtsmassage", es: "Masaje Facial Reafirmante Nusa", id: "Pijat Wajah Pengencangan Nusa" },
  "balijski-ciaza": { pl: "Masaż Balijski dla Kobiet w Ciąży", en: "Balinese Massage for Pregnant Women", uk: "Балійський масаж для вагітних", it: "Massaggio Balinese per Donne in Gravidanza", fr: "Massage Balinais pour Femmes Enceintes", de: "Balinesische Massage für Schwangere", es: "Masaje Balinés para Embarazadas", id: "Pijat Bali untuk Ibu Hamil" },
  "balijski-dzieci": { pl: "Masaż Balijski dla Dzieci", en: "Balinese Massage for Children", uk: "Балійський масаж для дітей", it: "Massaggio Balinese per Bambini", fr: "Massage Balinais pour Enfants", de: "Balinesische Massage für Kinder", es: "Masaje Balinés para Niños", id: "Pijat Bali untuk Anak-anak" },
  "goracymi-kamieniami": { pl: "Masaż Gorącymi Kamieniami", en: "Hot Stone Massage", uk: "Масаж гарячими каменями", it: "Massaggio con Pietre Calde", fr: "Massage aux Pierres Chaudes", de: "Hot-Stone-Massage", es: "Masaje con Piedras Calientes", id: "Pijat Batu Panas" },
  stemplami: { pl: "Masaż Stemplami", en: "Herbal Compress Massage", uk: "Масаж трав'яними мішечками", it: "Massaggio con Tamponi Erbali", fr: "Massage aux Tampons d'Herbes", de: "Kräuterstempel-Massage", es: "Masaje con Pindas Herbales", id: "Pijat Kompres Herbal" },
  "goraca-swieca": { pl: "Masaż Gorącą Świecą", en: "Hot Candle Massage", uk: "Масаж гарячою свічкою", it: "Massaggio con Candela Calda", fr: "Massage à la Bougie Chaude", de: "Massage mit warmer Kerze", es: "Masaje con Vela Caliente", id: "Pijat Lilin Panas" },
  "cztery-rece": { pl: "Ekskluzywny Masaż na 4 Ręce", en: "Exclusive Four-Hands Massage", uk: "Ексклюзивний масаж на 4 руки", it: "Massaggio Esclusivo a Quattro Mani", fr: "Massage Exclusif à Quatre Mains", de: "Exklusive Vier-Hände-Massage", es: "Masaje Exclusivo a Cuatro Manos", id: "Pijat Empat Tangan Eksklusif" },
};

export const oilNameTranslations: Record<string, Dict> = {
  "lawenda-rumianek": { pl: "Lawenda i Rumianek", en: "Lavender & Chamomile", uk: "Лаванда і Ромашка", it: "Lavanda e Camomilla", fr: "Lavande et Camomille", de: "Lavendel & Kamille", es: "Lavanda y Manzanilla", id: "Lavender & Kamomil" },
  "eukaliptus-mieta": { pl: "Eukaliptus i Mięta", en: "Eucalyptus & Mint", uk: "Евкаліпт і М'ята", it: "Eucalipto e Menta", fr: "Eucalyptus et Menthe", de: "Eukalyptus & Minze", es: "Eucalipto y Menta", id: "Eukaliptus & Mint" },
  "sandalowiec-cedr": { pl: "Sandałowiec i Cedr", en: "Sandalwood & Cedar", uk: "Сандал і Кедр", it: "Sandalo e Cedro", fr: "Santal et Cèdre", de: "Sandelholz & Zeder", es: "Sándalo y Cedro", id: "Cendana & Cedar" },
  bezzapachowy: { pl: "Bezzapachowy", en: "Unscented", uk: "Без запаху", it: "Inodore", fr: "Sans parfum", de: "Ohne Duft", es: "Sin fragancia", id: "Tanpa Aroma" },
};

export const oilSubtitleTranslations: Record<string, Dict> = {
  "lawenda-rumianek": { pl: "Relaksacyjny", en: "Relaxing", uk: "Розслаблюючий", it: "Rilassante", fr: "Relaxant", de: "Entspannend", es: "Relajante", id: "Relaksasi" },
  "eukaliptus-mieta": { pl: "Regeneracyjny", en: "Regenerating", uk: "Відновлюючий", it: "Rigenerante", fr: "Régénérant", de: "Regenerierend", es: "Regenerante", id: "Regenerasi" },
  "sandalowiec-cedr": { pl: "Uziemiający", en: "Grounding", uk: "Заземлюючий", it: "Radicante", fr: "Ancrant", de: "Erdend", es: "Enraizante", id: "Menenangkan" },
  bezzapachowy: { pl: "Hipoalergiczny", en: "Hypoallergenic", uk: "Гіпоалергенний", it: "Ipoallergenico", fr: "Hypoallergénique", de: "Hypoallergen", es: "Hipoalergénico", id: "Hipoalergenik" },
};

export const pressureTranslations: Record<PressureLevel, Dict> = {
  Lekki: { pl: "Lekki", en: "Light", uk: "Легкий", it: "Leggera", fr: "Légère", de: "Sanft", es: "Ligera", id: "Ringan" },
  Średni: { pl: "Średni", en: "Medium", uk: "Середній", it: "Media", fr: "Moyenne", de: "Mittel", es: "Media", id: "Sedang" },
  Mocny: { pl: "Mocny", en: "Firm", uk: "Сильний", it: "Forte", fr: "Ferme", de: "Kräftig", es: "Fuerte", id: "Kuat" },
  Głęboki: { pl: "Głęboki", en: "Deep", uk: "Глибокий", it: "Profonda", fr: "Profonde", de: "Tief", es: "Profunda", id: "Dalam" },
};

export const communicationTranslations: Record<CommunicationStyle, Dict> = {
  silent: { pl: "Sesja w ciszy", en: "Silent session", uk: "Сесія в тиші", it: "Sessione in silenzio", fr: "Séance silencieuse", de: "Stille Sitzung", es: "Sesión en silencio", id: "Sesi hening" },
  guided: { pl: "Z przewodnikiem", en: "Guided", uk: "З підказками", it: "Guidata", fr: "Guidée", de: "Mit Begleitung", es: "Guiada", id: "Dengan panduan" },
};

export const musicTranslations: Record<MusicPreference, Dict> = {
  nature: { pl: "Dźwięki natury", en: "Nature sounds", uk: "Звуки природи", it: "Suoni della natura", fr: "Sons de la nature", de: "Naturgeräusche", es: "Sonidos de la naturaleza", id: "Suara alam" },
  ambient: { pl: "Ambient", en: "Ambient", uk: "Ембіент", it: "Ambient", fr: "Ambiance", de: "Ambient", es: "Ambiental", id: "Ambient" },
  silence: { pl: "Cisza", en: "Silence", uk: "Тиша", it: "Silenzio", fr: "Silence", de: "Stille", es: "Silencio", id: "Hening" },
};

export const pillowTranslations: Record<string, Dict> = {
  Standardowa: { pl: "Standardowa", en: "Standard", uk: "Стандартна", it: "Standard", fr: "Standard", de: "Standard", es: "Estándar", id: "Standar" },
  "Ultra-miękka": { pl: "Ultra-miękka", en: "Ultra-soft", uk: "Ультрам'яка", it: "Ultra-morbido", fr: "Ultra-doux", de: "Ultra-weich", es: "Ultra-suave", id: "Ultra-lembut" },
};

export function t(key: string, lang: LangCode): string {
  return ui[key]?.[lang] ?? ui[key]?.pl ?? key;
}

// Like t(), but replaces {token} placeholders with the given values.
export function tf(key: string, lang: LangCode, vars: Record<string, string | number>): string {
  let s = t(key, lang);
  for (const [name, value] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
  }
  return s;
}

export function tZone(zoneId: string, lang: LangCode): string {
  return zoneTranslations[zoneId as ZoneId]?.[lang] ?? zoneId;
}
