import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// /design-lab — internal visual lab for redesign exploration.
//
// Four token sets rendered over static mockups of the three key surfaces
// (kiosk step, therapist queue, manager dashboard). No contexts, no data,
// no writes — this route is pure presentation and safe to visit anywhere.
// The current production look is extracted as the "Current" baseline theme
// so the redesign candidates are always judged against it side by side.
// ---------------------------------------------------------------------------

type ThemeId = "current" | "ubud" | "nusa" | "seminyak";

interface LabTheme {
  id: ThemeId;
  name: string;
  thesis: string;
  dark: boolean;
  /** CSS font-family stacks */
  display: string;
  body: string;
  /** Page + surface colors */
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  /** Primary action */
  accent: string;
  accentText: string;
  /** Secondary/status hue */
  good: string;
  goodTint: string;
  warn: string;
  warnTint: string;
  /** Shape language */
  radiusCard: number;
  radiusControl: number;
  /** Named palette chips shown in the direction bar */
  palette: { name: string; hex: string }[];
}

const THEMES: LabTheme[] = [
  {
    id: "current",
    name: "Current",
    thesis: "The production baseline — cream, Lora serif, clay accent.",
    dark: false,
    display: '"Lora", Georgia, serif',
    body: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
    bg: "#f9f6ef",
    surface: "#ffffff",
    surfaceAlt: "#ede6d7",
    text: "#33312c",
    muted: "#858175",
    border: "#d9cdb4",
    accent: "#c99a6a",
    accentText: "#ffffff",
    good: "#5f6b52",
    goodTint: "#e3e8da",
    warn: "#b6544f",
    warnTint: "#f3ddda",
    radiusCard: 16,
    radiusControl: 12,
    palette: [
      { name: "Cream", hex: "#f9f6ef" },
      { name: "Sand", hex: "#d9cdb4" },
      { name: "Clay", hex: "#c99a6a" },
      { name: "Sage", hex: "#5f6b52" },
      { name: "Charcoal", hex: "#33312c" },
    ],
  },
  {
    id: "ubud",
    name: "Ubud",
    thesis: "Rice terraces at dawn — volcanic stone, jungle green, an offering on the step.",
    dark: false,
    display: '"Fraunces", Georgia, serif',
    body: '"Inter", system-ui, sans-serif',
    bg: "#f4efe3",
    surface: "#fbf8f0",
    surfaceAlt: "#eae3d2",
    text: "#2b2a26",
    muted: "#7d7768",
    border: "#d8cfb8",
    accent: "#566b3a",
    accentText: "#f6f3e8",
    good: "#566b3a",
    goodTint: "#e4e7d6",
    warn: "#d99a2b",
    warnTint: "#f6ebd2",
    radiusCard: 10,
    radiusControl: 8,
    palette: [
      { name: "Frangipani", hex: "#f4efe3" },
      { name: "Rice terrace", hex: "#566b3a" },
      { name: "Teak", hex: "#9a6a43" },
      { name: "Basalt", hex: "#2b2a26" },
      { name: "Turmeric", hex: "#d99a2b" },
    ],
  },
  {
    id: "nusa",
    name: "Nusa",
    thesis: "A water temple after dark — black lava, oil-lamp gold, light on still water.",
    dark: true,
    display: '"Marcellus", Georgia, serif',
    body: '"Source Sans 3", system-ui, sans-serif',
    bg: "#12100d",
    surface: "#1c1a16",
    surfaceAlt: "#24211c",
    text: "#ece6d8",
    muted: "#a7b0a2",
    border: "#35322b",
    accent: "#c9a24b",
    accentText: "#181510",
    good: "#8fa08a",
    goodTint: "#232a22",
    warn: "#c9a24b",
    warnTint: "#2b2517",
    radiusCard: 14,
    radiusControl: 10,
    palette: [
      { name: "Lava black", hex: "#12100d" },
      { name: "Deep jungle", hex: "#1c2a26" },
      { name: "Moonlit stone", hex: "#a7b0a2" },
      { name: "Temple gold", hex: "#c9a24b" },
      { name: "Frangipani", hex: "#ece6d8" },
    ],
  },
  {
    id: "seminyak",
    name: "Seminyak",
    thesis: "Infinity pool at midday — teak, sea glass, frangipani white, bright and tactile.",
    dark: false,
    display: '"Sora", system-ui, sans-serif',
    body: '"Inter", system-ui, sans-serif',
    bg: "#f6f4ee",
    surface: "#ffffff",
    surfaceAlt: "#e9f0ef",
    text: "#24272a",
    muted: "#6d7a78",
    border: "#d5e0dd",
    accent: "#2e8c86",
    accentText: "#ffffff",
    good: "#2e8c86",
    goodTint: "#d9ebe8",
    warn: "#b5875a",
    warnTint: "#f2e7da",
    radiusCard: 22,
    radiusControl: 999,
    palette: [
      { name: "Porcelain", hex: "#f6f4ee" },
      { name: "Sky lagoon", hex: "#cfe3e0" },
      { name: "Lagoon teal", hex: "#2e8c86" },
      { name: "Teak", hex: "#b5875a" },
      { name: "Graphite", hex: "#24272a" },
    ],
  },
];

const LAB_FONTS_ID = "design-lab-fonts";
const LAB_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Marcellus&family=Sora:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap";

// --- Small helpers ----------------------------------------------------------

/** Canang sari offering seal — Ubud's completed-step mark. */
function CanangSeal({ color, petal }: { color: string; petal: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="2" y="2" width="18" height="18" rx="3" fill="none" stroke={color} strokeWidth="1.5" />
      <rect x="5" y="5" width="12" height="12" rx="2" fill="none" stroke={color} strokeWidth="0.75" opacity="0.5" />
      <circle cx="11" cy="11" r="2.4" fill={petal} />
      <circle cx="11" cy="6.8" r="1.3" fill={color} opacity="0.65" />
      <circle cx="15.2" cy="11" r="1.3" fill={color} opacity="0.65" />
      <circle cx="11" cy="15.2" r="1.3" fill={color} opacity="0.65" />
      <circle cx="6.8" cy="11" r="1.3" fill={color} opacity="0.65" />
    </svg>
  );
}

/** Kiosk step progress, rendered in each direction's signature language. */
function StepProgress({ t }: { t: LabTheme }) {
  const steps = ["Treatment", "Comfort", "Body map", "Handoff"];
  const active = 1;

  if (t.id === "ubud") {
    return (
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        {steps.map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {i < active ? (
              <CanangSeal color={t.accent} petal={t.warn} />
            ) : (
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 3,
                  border: `1.5px ${i === active ? "solid" : "dashed"} ${i === active ? t.accent : t.border}`,
                  display: "inline-block",
                }}
              />
            )}
            <span style={{ fontSize: 12, color: i <= active ? t.text : t.muted, letterSpacing: 0.4 }}>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  if (t.id === "nusa") {
    return (
      <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
        {steps.map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: i <= active ? t.accent : t.border,
                boxShadow: i === active ? `0 0 14px 3px ${t.accent}88` : "none",
              }}
            />
            <span style={{ fontSize: 12, color: i === active ? t.text : t.muted, letterSpacing: 1.2, textTransform: "uppercase" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (t.id === "seminyak") {
    return (
      <div style={{ display: "inline-flex", background: t.surfaceAlt, borderRadius: 999, padding: 4, gap: 4 }}>
        {steps.map((label, i) => (
          <span
            key={label}
            style={{
              padding: "7px 16px",
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              background: i === active ? t.accent : i < active ? t.surface : "transparent",
              color: i === active ? t.accentText : i < active ? t.accent : t.muted,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {steps.map((label, i) => (
        <span
          key={label}
          style={{
            width: i === active ? 26 : 10,
            height: 10,
            borderRadius: 999,
            background: i <= active ? t.accent : t.border,
            transition: "width 0.2s",
          }}
        />
      ))}
      <span style={{ fontSize: 12.5, color: t.muted, marginLeft: 6 }}>Step 2 of 4</span>
    </div>
  );
}

// --- Kiosk mockup -----------------------------------------------------------

const TREATMENTS = [
  { name: "Balinese ritual", minutes: "60 / 90 min", desc: "Long, flowing strokes and warm oil — the island classic.", price: "od 240 zł" },
  { name: "Warm stone", minutes: "90 min", desc: "River stones warmed slowly; deep, quiet ease.", price: "od 320 zł" },
  { name: "Herbal compress", minutes: "60 min", desc: "Steamed spice poultice pressed along the back.", price: "od 280 zł" },
];

function KioskMock({ t }: { t: LabTheme }) {
  const [picked, setPicked] = useState(0);
  const stage = t.id === "nusa";

  return (
    <div
      style={{
        background: stage
          ? `radial-gradient(ellipse 75% 60% at 50% 32%, #241f14 0%, ${t.bg} 70%)`
          : t.bg,
        borderRadius: 24,
        border: `1px solid ${t.border}`,
        padding: "clamp(24px, 4vw, 48px)",
        color: t.text,
        fontFamily: t.body,
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: t.id === "ubud" ? "left" : "center" }}>
        <p style={{ fontSize: 13, letterSpacing: 2.2, textTransform: "uppercase", color: t.muted, margin: 0 }}>
          Ubud Garden Spa · Seminyak
        </p>
        <h2
          style={{
            fontFamily: t.display,
            fontSize: "clamp(26px, 3.4vw, 40px)",
            fontWeight: t.id === "seminyak" ? 600 : 500,
            lineHeight: 1.15,
            margin: "10px 0 6px",
          }}
        >
          {t.id === "nusa" ? "The evening is yours" : "Choose your ritual"}
        </h2>
        <p style={{ color: t.muted, fontSize: 15, margin: "0 0 26px" }}>
          {t.id === "nusa"
            ? "Settle in — tell us how you would like to unwind."
            : "Take your time. Your therapist will tailor every detail."}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: t.id === "seminyak" ? "repeat(auto-fit, minmax(180px, 1fr))" : "1fr",
            gap: 12,
            textAlign: "left",
            marginBottom: 26,
          }}
        >
          {TREATMENTS.map((tr, i) => {
            const on = picked === i;
            const lit = stage && on;
            return (
              <button
                key={tr.name}
                onClick={() => setPicked(i)}
                style={{
                  display: "block",
                  width: "100%",
                  cursor: "pointer",
                  textAlign: "left",
                  background: on ? (t.dark ? t.surfaceAlt : t.surface) : stage ? "transparent" : t.surface,
                  border: `1.5px solid ${on ? t.accent : t.border}`,
                  borderRadius: t.radiusCard,
                  padding: "16px 20px",
                  color: "inherit",
                  fontFamily: "inherit",
                  opacity: stage && !on ? 0.55 : 1,
                  boxShadow: lit ? `0 0 34px 2px ${t.accent}33` : "none",
                  transition: "all 0.25s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontFamily: t.display, fontSize: 19, fontWeight: 500 }}>{tr.name}</span>
                  <span style={{ fontSize: 13, color: on ? t.accent : t.muted, whiteSpace: "nowrap" }}>{tr.minutes}</span>
                </div>
                <p style={{ margin: "6px 0 8px", fontSize: 13.5, color: t.muted, lineHeight: 1.5 }}>{tr.desc}</p>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? t.accent : t.text }}>{tr.price}</span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: t.id === "ubud" ? "space-between" : "center",
          }}
        >
          <StepProgress t={t} />
          <button
            style={{
              cursor: "pointer",
              border: "none",
              background: t.accent,
              color: t.accentText,
              fontFamily: t.body,
              fontSize: 16,
              fontWeight: 600,
              padding: t.id === "seminyak" ? "16px 38px" : "14px 32px",
              borderRadius: t.radiusControl,
              boxShadow: stage ? `0 0 26px 1px ${t.accent}55` : "none",
              letterSpacing: t.id === "nusa" ? 1.4 : 0.2,
              textTransform: t.id === "nusa" ? "uppercase" : "none",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Queue mockup -----------------------------------------------------------

const QUEUE = [
  { guest: "Anna K.", treatment: "Balinese ritual · 90 min", when: "14:30", zones: 3, fresh: true },
  { guest: "Marek + Julia", treatment: "Warm stone (couple) · 60 min", when: "15:15", zones: 1, fresh: false },
];

function QueueMock({ t }: { t: LabTheme }) {
  return (
    <div
      style={{
        background: t.bg,
        borderRadius: 24,
        border: `1px solid ${t.border}`,
        padding: "clamp(20px, 3vw, 36px)",
        color: t.text,
        fontFamily: t.body,
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h3 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, margin: 0 }}>Today's guests</h3>
          <span style={{ fontSize: 13, color: t.muted }}>2 waiting</span>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {QUEUE.map((q) => (
            <div
              key={q.guest}
              style={{
                background: t.surface,
                border: `1px solid ${q.fresh ? t.accent : t.border}`,
                borderRadius: t.radiusCard,
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontFamily: t.display, fontSize: 17, fontWeight: 500 }}>{q.guest}</span>
                  {q.fresh && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        color: t.good,
                        background: t.goodTint,
                        padding: "3px 9px",
                        borderRadius: 999,
                      }}
                    >
                      new
                    </span>
                  )}
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 13.5, color: t.muted }}>
                  {q.treatment} · {q.zones} focus {q.zones === 1 ? "zone" : "zones"}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, color: t.muted }}>{q.when}</span>
                <button
                  style={{
                    cursor: "pointer",
                    border: `1.5px solid ${t.accent}`,
                    background: q.fresh ? t.accent : "transparent",
                    color: q.fresh ? t.accentText : t.accent,
                    fontFamily: t.body,
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "9px 20px",
                    borderRadius: t.radiusControl,
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Dashboard mockup -------------------------------------------------------

const STATS = [
  { label: "Check-ins this week", value: "48" },
  { label: "Guest satisfaction", value: "4.8" },
  { label: "Would recommend", value: "92%" },
];

const ROWS = [
  { name: "Balinese ritual", count: 21, csat: "4.9" },
  { name: "Warm stone", count: 14, csat: "4.8" },
  { name: "Herbal compress", count: 13, csat: "4.6" },
];

function DashboardMock({ t }: { t: LabTheme }) {
  return (
    <div
      style={{
        background: t.bg,
        borderRadius: 24,
        border: `1px solid ${t.border}`,
        padding: "clamp(20px, 3vw, 36px)",
        color: t.text,
        fontFamily: t.body,
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            background: t.warnTint,
            border: `1px solid ${t.warn}55`,
            borderRadius: t.radiusCard,
            padding: "12px 18px",
            fontSize: 13.5,
            color: t.dark ? t.text : "#5d4a1e",
            marginBottom: 18,
          }}
        >
          Subscription renews in 9 days — everything keeps running as usual.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          {STATS.map((s) => (
            <div
              key={s.label}
              style={{
                background: t.surface,
                border: `1px solid ${t.border}`,
                borderRadius: t.radiusCard,
                padding: "16px 18px",
              }}
            >
              <p style={{ margin: 0, fontSize: 12.5, color: t.muted }}>{s.label}</p>
              <p style={{ margin: "6px 0 0", fontFamily: t.display, fontSize: 28, fontWeight: 500 }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.radiusCard, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontFamily: t.display, fontSize: 17, fontWeight: 500 }}>By treatment</span>
          </div>
          {ROWS.map((r, i) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 20px",
                borderBottom: i < ROWS.length - 1 ? `1px solid ${t.border}` : "none",
                fontSize: 14.5,
              }}
            >
              <span>{r.name}</span>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <span style={{ color: t.muted, fontSize: 13.5 }}>{r.count} visits</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: t.good,
                    background: t.goodTint,
                    padding: "3px 12px",
                    borderRadius: 999,
                    fontSize: 13.5,
                  }}
                >
                  {r.csat}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Page -------------------------------------------------------------------

export function DesignLab() {
  const [themeId, setThemeId] = useState<ThemeId>("ubud");
  const t = THEMES.find((x) => x.id === themeId)!;

  // Candidate display/body fonts load only on this route.
  useEffect(() => {
    if (document.getElementById(LAB_FONTS_ID)) return;
    const link = document.createElement("link");
    link.id = LAB_FONTS_ID;
    link.rel = "stylesheet";
    link.href = LAB_FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: t.dark ? "#0b0a08" : "#efece4", transition: "background 0.3s" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: t.dark ? "#171511ee" : "#fbf9f4ee",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${t.dark ? "#2c2922" : "#e0dbcd"}`,
          padding: "14px clamp(16px, 4vw, 40px)",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          justifyContent: "space-between",
          color: t.dark ? "#ece6d8" : "#33312c",
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Design lab</span>
          <span style={{ fontSize: 13, opacity: 0.65, marginLeft: 10 }}>{t.thesis}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {THEMES.map((x) => (
            <button
              key={x.id}
              onClick={() => setThemeId(x.id)}
              style={{
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 600,
                padding: "8px 16px",
                borderRadius: 999,
                border: `1.5px solid ${x.id === themeId ? t.accent : "transparent"}`,
                background: x.id === themeId ? t.accent : t.dark ? "#26231d" : "#eee9dd",
                color: x.id === themeId ? t.accentText : "inherit",
              }}
            >
              {x.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "clamp(20px, 4vw, 44px) clamp(16px, 4vw, 40px)", display: "grid", gap: 28 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {t.palette.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: c.hex,
                  border: "1px solid rgba(128,120,100,0.35)",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12.5, color: t.dark ? "#a7b0a2" : "#6f6a5d", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                {c.name} <code style={{ fontSize: 11, opacity: 0.7 }}>{c.hex}</code>
              </span>
            </div>
          ))}
        </div>

        <Section label="Kiosk — guest intake" dark={t.dark}>
          <KioskMock t={t} />
        </Section>
        <Section label="Therapist queue" dark={t.dark}>
          <QueueMock t={t} />
        </Section>
        <Section label="Manager dashboard" dark={t.dark}>
          <DashboardMock t={t} />
        </Section>
      </div>
    </div>
  );
}

function Section({ label, dark, children }: { label: string; dark: boolean; children: React.ReactNode }) {
  return (
    <section>
      <p
        style={{
          fontSize: 12,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          fontWeight: 600,
          color: dark ? "#8a8577" : "#8b8574",
          margin: "0 0 10px",
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}
      >
        {label}
      </p>
      {children}
    </section>
  );
}
