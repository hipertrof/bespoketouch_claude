#!/usr/bin/env python3
"""
UI/UX Pro Max Design Intelligence Search Tool
Query design systems, patterns, colors, typography, and UX guidelines.
"""

import sys
import argparse
import json
from pathlib import Path

# Design knowledge base (can be expanded with CSV/JSON data files)
DESIGN_DATABASE = {
    "styles": {
        "minimalism": {
            "description": "Clean, simple, content-focused design",
            "characteristics": ["Ample whitespace", "Limited color palette", "Simple typography", "Subtle interactions"],
            "best_for": ["SaaS", "productivity tools", "editorial sites"]
        },
        "glassmorphism": {
            "description": "Frosted glass effect with semi-transparency",
            "characteristics": ["Backdrop blur", "Semi-transparent backgrounds", "Vibrant accents", "Layered depth"],
            "best_for": ["Modern apps", "music/entertainment", "futuristic brands"]
        },
        "brutalism": {
            "description": "Bold, raw, high-contrast design",
            "characteristics": ["Heavy typography", "High contrast", "Grid-based", "Anti-design aesthetic"],
            "best_for": ["Creative studios", "tech startups", "editorial brands"]
        },
        "luxury": {
            "description": "Elegant, premium, high-end aesthetic",
            "characteristics": ["Serif typography", "Gold/silver accents", "Generous whitespace", "Rich materials"],
            "best_for": ["Fashion", "jewelry", "hospitality", "luxury services"]
        },
        "playful": {
            "description": "Vibrant, fun, engaging design",
            "characteristics": ["Bright colors", "Organic shapes", "Rounded corners", "Approachable tone"],
            "best_for": ["Consumer apps", "games", "education", "lifestyle"]
        }
    },
    "product_types": {
        "service": {
            "description": "Service-based businesses (massage, beauty, wellness)",
            "patterns": ["Hero with imagery", "Service selection flow", "Booking/scheduling", "Review/testimonials"],
            "key_metrics": ["Trust-building", "Clarity of offerings", "Booking frictionlessness"]
        },
        "saas": {
            "description": "Software-as-a-service platforms",
            "patterns": ["Dashboard", "Sidebar navigation", "Data visualization", "User onboarding"],
            "key_metrics": ["Clarity", "Efficiency", "Scalability"]
        }
    },
    "ux_guidelines": {
        "accessibility": ["Contrast 4.5:1 WCAG AA", "Keyboard navigation", "Descriptive alt text", "ARIA labels for interactive elements"],
        "touch_targets": ["Minimum 44×44px (iOS) / 48×48dp (Android)", "8px+ spacing between targets", "Clear press feedback"],
        "animation": ["Duration 150–300ms for micro-interactions", "Respect prefers-reduced-motion", "Meaningful motion (not decorative)"],
        "color": ["Use semantic tokens", "Support light + dark modes", "Don't rely on color alone", "Test for colorblind users"]
    },
    "typography": {
        "pairings": [
            {"heading": "Playfair Display", "body": "Lato", "use_case": "luxury, editorial"},
            {"heading": "Inter", "body": "Inter", "use_case": "SaaS, minimalism"},
            {"heading": "Poppins", "body": "Poppins", "use_case": "playful, modern"},
            {"heading": "Crimson Text", "body": "Source Sans Pro", "use_case": "elegant, professional"}
        ]
    },
    "colors": {
        "spa_wellness": {
            "primary": "#4A7C7E",  # Muted teal
            "secondary": "#D4A574", # Warm sand
            "accent": "#8B6F47",   # Earthy brown
            "neutral": "#F5F5F0",  # Warm white
            "description": "Calming, natural, spa-inspired palette"
        }
    }
}

def search_design_system(query, project_name=None, variance=5, motion=5, density=5, output_format="ascii"):
    """Generate comprehensive design system based on query."""
    print(f"\n{'='*60}")
    print(f"Design System: {project_name or 'Untitled'}")
    print(f"{'='*60}\n")

    print(f"Query: {query}")
    print(f"Configuration: Variance={variance}, Motion={motion}, Density={density}\n")

    print("PATTERN & STYLE")
    print("-" * 40)
    if "spa" in query.lower() or "wellness" in query.lower() or "service" in query.lower():
        print("• Product Type: Service (Booking/Wellness)")
        print("• Recommended Style: Luxury + Minimalism")
        print("• Key Focus: Trust, Clarity, Ease of booking")
    print()

    print("COLOR PALETTE")
    print("-" * 40)
    if "spa" in query.lower():
        palette = DESIGN_DATABASE["colors"]["spa_wellness"]
        print(f"• Primary: {palette['primary']} (Muted Teal)")
        print(f"• Secondary: {palette['secondary']} (Warm Sand)")
        print(f"• Accent: {palette['accent']} (Earthy Brown)")
        print(f"• Neutral: {palette['neutral']} (Warm White)")
        print(f"• Description: {palette['description']}")
    print()

    print("TYPOGRAPHY")
    print("-" * 40)
    print("• Heading: Playfair Display (luxury, elegant)")
    print("• Body: Lato (readable, friendly)")
    print("• Scale: 12, 14, 16, 18, 24, 32, 48px")
    print()

    print("SPACING & LAYOUT")
    print("-" * 40)
    if density <= 3:
        print("• Mode: Spacious (24-96px scale)")
    elif density <= 7:
        print("• Mode: Standard (16-64px scale)")
    else:
        print("• Mode: Dense/Dashboard (8-32px scale)")
    print("• Grid: 4px/8dp increment system")
    print()

    print("ANIMATION & MOTION")
    print("-" * 40)
    if motion <= 3:
        print("• Tier: Subtle (150ms micro-interactions)")
    elif motion <= 7:
        print("• Tier: Standard (200-300ms transitions)")
    else:
        print("• Tier: Complex (300-400ms choreography)")
    print()

    print("UX PRIORITIES")
    print("-" * 40)
    print("1. Accessibility: WCAG AA compliance, 4.5:1 contrast")
    print("2. Touch: 44×44px min, 8px spacing, clear feedback")
    print("3. Performance: WebP images, lazy load, CLS < 0.1")
    print("4. Responsive: Mobile-first, 375 > 768 > 1440px breakpoints")
    print()

    print("ANTI-PATTERNS TO AVOID")
    print("-" * 40)
    print("• Mixing flat + skeuomorphic styles randomly")
    print("• Emojis as structural icons (use SVG)")
    print("• Text < 12px on body content")
    print("• Hover-only interactions (mobile-unfriendly)")
    print("• Layout shifts on load (reserve space for async content)")
    print()

def search_domain(query, domain, max_results=10):
    """Search a specific design domain."""
    print(f"\n{'='*60}")
    print(f"Domain Search: {domain.upper()}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")

    if domain == "style":
        print("Matching Styles:")
        for style, details in DESIGN_DATABASE["styles"].items():
            if any(word in query.lower() for word in [style] + details.get("characteristics", [])):
                print(f"\n• {style.title()}")
                print(f"  {details['description']}")
                print(f"  Characteristics: {', '.join(details['characteristics'])}")
                print(f"  Best for: {', '.join(details['best_for'])}")

    elif domain == "product":
        print("Matching Product Types:")
        for product, details in DESIGN_DATABASE["product_types"].items():
            if product in query.lower():
                print(f"\n• {product.title()}")
                print(f"  {details['description']}")
                print(f"  Patterns: {', '.join(details['patterns'])}")

    elif domain == "typography":
        print("Font Pairings:")
        for pairing in DESIGN_DATABASE["typography"]["pairings"]:
            print(f"\n• Heading: {pairing['heading']} / Body: {pairing['body']}")
            print(f"  Use case: {pairing['use_case']}")

    elif domain == "color":
        print("Color Palettes:")
        if "spa" in query.lower():
            palette = DESIGN_DATABASE["colors"]["spa_wellness"]
            print(f"\n• Spa & Wellness")
            for key, value in palette.items():
                if key != "description":
                    print(f"  {key.title()}: {value}")
            print(f"  {palette['description']}")

    elif domain == "ux":
        print("UX Guidelines:")
        for guideline_type, items in DESIGN_DATABASE["ux_guidelines"].items():
            print(f"\n{guideline_type.title()}:")
            for item in items:
                print(f"  ✓ {item}")

    print()

def main():
    parser = argparse.ArgumentParser(
        description="UI/UX Pro Max Design Intelligence Search",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 search.py "beauty spa wellness" --design-system -p "BespokeTouch"
  python3 search.py "minimalism dark" --domain style
  python3 search.py "wellness" --domain color
  python3 search.py "animation accessibility" --domain ux --stack nextjs
        """
    )

    parser.add_argument("query", help="Search query")
    parser.add_argument("--design-system", action="store_true", help="Generate full design system")
    parser.add_argument("--domain", choices=["style", "color", "typography", "product", "ux", "chart", "landing", "google-fonts"],
                        help="Search specific domain")
    parser.add_argument("-p", "--project", dest="project", help="Project name")
    parser.add_argument("-f", "--format", choices=["ascii", "markdown", "json"], default="ascii", help="Output format")
    parser.add_argument("--variance", type=int, default=5, choices=range(1, 11), help="Design boldness (1-10)")
    parser.add_argument("--motion", type=int, default=5, choices=range(1, 11), help="Animation complexity (1-10)")
    parser.add_argument("--density", type=int, default=5, choices=range(1, 11), help="Content density (1-10)")
    parser.add_argument("--stack", choices=["react", "nextjs", "vue", "svelte", "swiftui", "flutter", "react-native"],
                        help="Target technology stack")
    parser.add_argument("--persist", action="store_true", help="Save design system to design-system/ folder")
    parser.add_argument("-n", "--max-results", type=int, default=10, help="Maximum results to return")

    args = parser.parse_args()

    if args.design_system:
        search_design_system(args.query, args.project, args.variance, args.motion, args.density, args.format)
    elif args.domain:
        search_domain(args.query, args.domain, args.max_results)
    else:
        print("Error: Provide either --design-system or --domain")
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()
