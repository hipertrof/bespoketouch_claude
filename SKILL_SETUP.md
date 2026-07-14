# UI/UX Pro Max Skill - Setup & Usage

The UI/UX Pro Max skill has been installed in `skills/ui-ux-pro-max/`. This provides comprehensive design intelligence for your BespokeTouch project.

## Quick Start

### Generate a Design System for BespokeTouch

```bash
python skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service booking" --design-system -p "BespokeTouch"
```

**Output**: Complete design system with:
- Recommended pattern & style (Luxury + Minimalism for spa services)
- Color palette (spa-inspired: teal, sand, brown, warm white)
- Typography (Playfair Display + Lato)
- Spacing & layout system
- Animation/motion guidelines
- UX priorities & anti-patterns

### Search Specific Design Domains

#### Find Style Options
```bash
python skills/ui-ux-pro-max/scripts/search.py "luxury minimal dark" --domain style
```

#### Find Color Palettes
```bash
python skills/ui-ux-pro-max/scripts/search.py "spa wellness" --domain color
```

#### Find Font Pairings
```bash
python skills/ui-ux-pro-max/scripts/search.py "elegant professional" --domain typography
```

#### Get UX Best Practices
```bash
python skills/ui-ux-pro-max/scripts/search.py "dark mode accessibility animation" --domain ux
```

## Fine-Tune Design System with Dials

Add optional parameters to adjust the design system without changing your query:

```bash
python skills/ui-ux-pro-max/scripts/search.py "spa booking" --design-system \
  --variance 6 --motion 5 --density 4 -p "BespokeTouch"
```

- **`--variance 1-10`**: Design boldness (1 = minimal/centered, 10 = bold/asymmetric)
- **`--motion 1-10`**: Animation complexity (1 = subtle, 10 = complex choreography)
- **`--density 1-10`**: Content density (1 = spacious, 10 = dense/dashboard)

## Apply to BespokeTouch

The current design system for BespokeTouch based on `--design-system "spa wellness"`:

**Color Palette:**
- Primary: `#4A7C7E` (Muted Teal) — use for primary CTAs, headers
- Secondary: `#D4A574` (Warm Sand) — use for accents, secondary actions
- Accent: `#8B6F47` (Earthy Brown) — use for emphasis, premium elements
- Neutral: `#F5F5F0` (Warm White) — use for backgrounds, surfaces

**Typography:**
- Headings: Playfair Display (elegant, luxury feel)
- Body: Lato (readable, friendly, modern)
- Scale: 12, 14, 16, 18, 24, 32, 48px

**Layout:**
- Spacing: 16–64px increments (standard density)
- Grid: 4px/8dp system
- Breakpoints: 375px (mobile) > 768px (tablet) > 1440px (desktop)

**Animation:**
- Duration: 200–300ms for transitions
- Easing: ease-out for entering, ease-in for exiting
- Respect `prefers-reduced-motion`

## Key UX Priorities (for BespokeTouch)

1. **Accessibility**: WCAG AA (4.5:1 contrast), keyboard navigation, descriptive labels
2. **Touch**: 44×44px minimum tap targets, 8px spacing between, clear press feedback
3. **Performance**: WebP images, lazy loading, CLS < 0.1 (no layout shifts)
4. **Responsive**: Mobile-first design, test on 375px, 768px, 1440px
5. **Navigation**: Clear back behavior, predictable patterns, deep linking support

## Anti-Patterns to Avoid

- ❌ Mixing flat + skeuomorphic styles randomly
- ❌ Using emojis as structural icons (use SVG instead)
- ❌ Body text smaller than 12px
- ❌ Hover-only interactions (breaks on mobile)
- ❌ Layout shifts on content load (reserve space)

## Available Domains

| Domain | Use For | Example |
|--------|---------|---------|
| `style` | UI styles, colors, effects | `--domain style "glassmorphism"` |
| `color` | Color palettes | `--domain color "spa wellness"` |
| `typography` | Font pairings | `--domain typography "elegant"` |
| `product` | Product type patterns | `--domain product "service"` |
| `ux` | UX best practices | `--domain ux "animation accessibility"` |
| `chart` | Chart types & viz | `--domain chart "analytics"` |
| `landing` | Page structure | `--domain landing "hero conversion"` |

## Use Cases for BespokeTouch

- **Review header/logo design** → `--domain ux "typography contrast hierarchy"`
- **Optimize welcome screen layout** → `--design-system "form ux mobile"`
- **Choose accent colors for CTAs** → `--domain color "service booking"`
- **Implement dark mode** → `--domain style "dark mode spa"`
- **Animation polish** → `--domain ux "animation micro-interaction"`
- **Accessibility audit** → `--domain ux "accessibility wcag contrast"`

## Python Version

Requires Python 3.6+. Check:
```bash
python --version  # Windows
python3 --version # macOS/Linux
```

## Next Steps

1. Run `--design-system` to get the full system recommendation
2. Explore specific domains (color, typography, ux) for details
3. Use the guidelines in code reviews and component design
4. Reference the Quick Reference checklist (in README.md) for pre-delivery QA
