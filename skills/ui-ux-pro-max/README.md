# UI/UX Pro Max Skill

Comprehensive UI/UX design intelligence for web and mobile applications.

## Features

- 50+ design styles
- 161 color palettes  
- 57 font pairings
- 161 product type patterns
- 99 UX guidelines
- 25 chart types
- 10 technology stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, HTML/CSS)

## Quick Start

### Generate a Design System
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness" --design-system -p "BespokeTouch"
```

### Search Specific Domains
```bash
# Style options
python3 skills/ui-ux-pro-max/scripts/search.py "luxury minimal" --domain style

# Color palettes
python3 skills/ui-ux-pro-max/scripts/search.py "wellness spa" --domain color

# Typography/fonts
python3 skills/ui-ux-pro-max/scripts/search.py "elegant professional" --domain typography

# UX best practices
python3 skills/ui-ux-pro-max/scripts/search.py "dark mode accessibility" --domain ux
```

### Design Dials (Optional Fine-Tuning)
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "service booking" --design-system \
  --variance 5 --motion 6 --density 4
```

- `--variance`: 1-3 (minimal) to 8-10 (bold/asymmetric)
- `--motion`: 1-3 (subtle) to 8-10 (complex choreography)
- `--density`: 1-3 (spacious) to 8-10 (dense/dashboard)

## Available Domains

- `product` - Product type recommendations
- `style` - UI styles, colors, effects
- `typography` - Font pairings, Google Fonts
- `color` - Color palettes
- `landing` - Page structure strategies
- `chart` - Chart types and recommendations
- `ux` - Best practices and anti-patterns
- `google-fonts` - Individual Google Fonts lookup
- `react` / `nextjs` / `vue` - Stack-specific guidance

## Use Cases

- Design new pages (landing, dashboard, admin, SaaS, mobile app)
- Create/refactor UI components
- Choose color schemes, typography, spacing
- Review UI for UX, accessibility, consistency
- Implement navigation, animations, responsive behavior
- Pre-launch UI quality optimization
- Dark mode implementation
- Accessibility review

## Key References

See the rule categories in the skill documentation:

1. **CRITICAL**: Accessibility, Touch & Interaction
2. **HIGH**: Performance, Style Selection, Layout & Responsive, Navigation
3. **MEDIUM**: Typography & Color, Animation, Forms & Feedback
4. **LOW**: Charts & Data

For detailed rules, see the Quick Reference section in the skill description.
