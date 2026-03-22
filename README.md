# Certificate & Name Tag Generator (Vite + React)

Generate personalized PDF certificates or name tags from a PDF template and a CSV list. Download all as a single PDF or a ZIP archive, or send them directly via email as attachments.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 6
- **PDF generation:** pdf-lib, pdfjs-dist
- **CSV parsing:** PapaParse
- **Email sending:** Nodemailer (Express backend)
- **Archive:** JSZip

## Quick Start

```bash
npm install
npm run server   # starts backend API on port 4000
npm run dev      # starts frontend with proxy to /api
```

Open the URL shown by `npm run dev` (usually http://localhost:5173).

> Both commands must be running at the same time — open two terminal windows.

## How to Use

### Step 1 — Upload PDF template
Upload your base graphic as a PDF file.

### Step 2 — Upload CSV with data
Upload a CSV file with participant data. Supported column headers (case-insensitive):

| Field | Recognized headers |
|---|---|
| First name | `firstName`, `first_name`, `Imię`, `imie`, `name`, `given_name` |
| Last name | `lastName`, `last_name`, `Nazwisko`, `nazwisko`, `surname` |
| E-mail | `email`, `mail`, `e-mail`, `E-mail`, `adres`, `adres email` |

If no recognized headers are found, columns are read positionally: 1 = first name, 2 = last name, 3 = email.

**Example CSV:**
```csv
Imię,Nazwisko,E-mail
Jan,Kowalski,jan.kowalski@example.com
Anna,Nowak,anna.nowak@example.com
```

### Step 3 — Configure text style
Set font size, color, and text alignment (left / center / right). Optionally upload a custom `.ttf` font file — required for non-Latin characters (e.g. Polish `ą`, `ę`, `ł`, `ó`, `ż`).

> A default font (`public/fonts/default-font.ttf`) is used when no custom font is uploaded. Make sure this file exists — download a UTF-8 compatible font such as [Lato](https://fonts.google.com/specimen/Lato) and rename it.

### Step 4 — Choose output format
- **Single PDF** — all certificates merged into one file
- **ZIP** — one PDF per person, packed into a ZIP archive

### Preview & positioning
After uploading the PDF template, a preview appears on the right. Click or drag on the preview to set the exact position where the name will be placed.

### Step 5 — Send via email (optional)
Fill in your SMTP credentials and message content, then click **Send emails**.

#### Gmail setup
1. Enable **2-Step Verification** at [myaccount.google.com](https://myaccount.google.com) → Security → 2-Step Verification
2. Generate an **App Password** at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords):
   - Enter any name e.g. `Winietki` and click **Create**
   - Copy the 16-character password in format `xxxx xxxx xxxx xxxx` — Google shows it only once
3. Use these settings:

| Field | Value |
|---|---|
| SMTP host | `smtp.gmail.com` |
| SMTP port | `587` |
| Login | your Gmail address |
| Password | 16-character app password |
| From | your Gmail address |
| Encrypted connection | unchecked (port 587 uses STARTTLS) |

#### Email placeholders
Use these in the subject and message body:

| Placeholder | Replaced with |
|---|---|
| `{fullName}` | Title + first name + last name |
| `{firstName}` | First name |
| `{lastName}` | Last name |

#### Dry-run mode
Check **Test mode (no sending)** to simulate the send without actually delivering any emails. Use this to verify your setup before a real send.

## Project Structure

```
winietki/
├── public/
│   ├── assets/
│   │   └── pdf.worker.min.mjs   # PDF.js worker (required for preview)
│   └── fonts/
│       └── default-font.ttf     # fallback font (must support UTF-8)
├── src/
│   ├── App.tsx                  # main application component
│   ├── App.css                  # styles
│   └── main.tsx                 # entry point
├── server.mjs                   # Express backend (email sending)
├── vite.config.ts               # Vite config with /api proxy
└── package.json
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run server` | Start Express backend on port 4000 |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build locally |

## Known Limitations

- Custom fonts must be in `.ttf` format
- Without a UTF-8 compatible font, names with special characters (ą, ę, ł, etc.) will fail to render
- The backend must be running separately — it is not bundled into the frontend build
- Email attachments are generated on the server side; large CSV files with many recipients may take a while

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
