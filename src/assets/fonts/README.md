# PDF fonts (Thai + Latin)

Officer inspection PDF export uses **PDFKit**. The font must include:

- Thai script (รายงาน, สถานประกอบการ, …)
- Latin + digits (`DIW`, `RNG4-00001`, `IR-2026-000001`)

| File | Weight |
| --- | --- |
| `Sarabun-Regular.ttf` | Body |
| `Sarabun-Bold.ttf` | Headings |

Source: [google/fonts – ofl/sarabun](https://github.com/google/fonts/tree/main/ofl/sarabun) (SIL Open Font License).

## Why not Noto Sans Thai alone?

The common `NotoSansThai-*.ttf` builds are **Thai-script only**. PDFKit then draws
`.notdef` (□) for ASCII letters and digits — so data fields look broken even
when Thai headings look fine.

## Valid file check

TrueType magic bytes: `00 01 00 00` (hex `00010000`). Never commit HTML error
pages renamed to `.ttf`.
