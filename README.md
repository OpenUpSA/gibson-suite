# gibson-suite

A monorepo-style container for the GIBS/Earth-observation app family, with one
sub-project per target platform.

## Projects

| Folder      | Platform  | Description                                            |
| ----------- | --------- | ------------------------------------------------------ |
| `desktop/`  | Desktop   | The original React + Vite GIBS viewer (standalone app) |
| `canva/`    | Canva     | Canva app (TypeScript + webpack) for embedding layers  |
| `wordpress/`| WordPress | (Placeholder) WordPress integration / plugin           |
| `figma/`    | Figma     | (Placeholder) Figma plugin / integration               |

## Layout

```
gibson-suite/
├── desktop/      # original React app (own git history + remote)
├── canva/        # Canva app
├── wordpress/    # WordPress integration (placeholder)
└── figma/        # Figma plugin (placeholder)
```

Each sub-project is self-contained with its own dependencies and tooling. See
the `README.md` inside each folder for platform-specific details.
