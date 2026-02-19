# Template Visualizer & Editor

A Next.js app that lets you paste HTML template code with `{{variables}}`, preview it with dummy data, and edit elements (padding, remove) visually. The output is the same template format with variables intact and **formatting/spacing preserved**.

## Features

- **Paste template code** – HTML with `{{variable}}` placeholders
- **Dummy data** – JSON object used to fill variables in the preview (no real data)
- **Live preview** – See how the template looks with sample data
- **Inspect** – Click any element in the preview to select it
- **Edit padding** – Set padding (e.g. `16px`, `1rem`) on the selected element
- **Remove element** – Remove the selected element from the template
- **Get output** – Get the final template code with variables and formatting preserved; copy to clipboard

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- Variables in the template use the form `{{name}}` (e.g. `{{orderId}}`, `{{amount}}`).
- The parser keeps source positions so edits (padding injection, removal) are applied with minimal string changes, preserving indentation and line breaks.
- Output is the same format as input: still with `{{variables}}`, only structure and inline styles updated.

## Tech

- Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- [parse5](https://github.com/inikulin/parse5) for HTML parsing with source locations
