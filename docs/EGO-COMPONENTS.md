# ego(lite) Style in Naru

Naru's own controls follow the ego(lite) Style design system. No component is added for decoration; each existing control is drawn as its design-system counterpart, with the system's token values.

| Naru control | Design-system component | Where it is styled |
| --- | --- | --- |
| Buttons (pill, icon after the label, one primary per view) | Button | `styles.css` |
| Chat / Agent / Plan switch, steering switch | PillTabs (segmented) | `styles.css`, `ego-composer.css` |
| Status labels | Badge | `styles.css`, `ego-components.css` |
| Conversation list | Sidebar | `styles.css`, `ego-components.css` |
| Message box | Composer | `ego-composer.css` |
| Hover labels | Tooltip | `ego.js`, `ego-extra.css` |
| Notifications inside the app | Toast (with action pill) | `styles.css`, `ego-extra.css` |
| File preview | Window | `ego-extra.css` |
| Files in the side panel | SpaceCard | `ego-extra.css` |
| Skill and workflow cards | Card ring + SpaceCard hover | `defined-components.css` |
| Agent at work: edge glow, dot field, current step | AgentWindow | `ego-agent-status.css` |
| First screen, Light and Dark | HeroHorizon | `app.js`, `styles.css` |
| First screen, Defined | HalftoneField | `app.js`, `hero-motion.css` |
| Themes | Light, Dark, Defined | `styles.css`, `defined-theme.css` |
| Dotted texture | Dotted texture (Naru) | `docs/DOT-PATTERN.md` |
