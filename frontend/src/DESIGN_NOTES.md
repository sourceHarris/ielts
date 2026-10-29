# Design notes: light-first white/black and red

User direction: exactly two themes, light default, dark resembling ChatGPT black/white, red as the primary contrast/accent color.

- Use semantic CSS tokens for colors and both mode palettes. Avoid overriding dark mode based on system `prefers-color-scheme` after the user chooses.
- Red signals interactive selection, highlights and primary CTA; keep green only for objectively correct/success feedback. Do not use red for right/wrong interchangeably.
- Keep translucent blur only in functional navigation. Do not put glass on data cards or passage backgrounds.
- Body text on neutral backgrounds; comfortable contrast and scalable type.
- Theme switch should be keyboard and screen-reader accessible and never appear as a navigation tab.
- Dark mode uses black/charcoal surfaces and white type, not a green tinted backdrop.
- Web approximation of glass, not Apple proprietary native Liquid Glass.
