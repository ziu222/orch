---
name: orch Console
description: A local multi-vendor agent orchestrator, set as one navy-ink hardcover notebook lying open at a ruled page.
colors:
  navy-ink-accent: "#2a3f7a"
  on-accent: "#f3f6fd"
  bookcloth-cover: "#22356b"
  cover-deep: "#17254d"
  cover-ink: "#e9eefb"
  blue-white-paper: "#f8faff"
  paper-shade: "#eef2fb"
  ink-wash-fill: "#e3e9f7"
  ruled-line: "#d3dcf0"
  hairline-rule: "#b7c4e3"
  margin-rule: "#7f92c4"
  navy-black-ink: "#142042"
  faded-ink: "#44578c"
  note-butter: "#f1df9c"
  note-sage: "#c9dfc4"
  note-sky: "#c7d9ef"
  note-rose: "#ecc9cf"
  note-lilac: "#d9cfee"
  note-apricot: "#f0d2b6"
  on-note: "#1d2747"
  night-note-butter: "#cdb75e"
  night-note-sage: "#95b28d"
  night-note-sky: "#90abcf"
  night-note-rose: "#c79ba3"
  night-note-lilac: "#ab9dcd"
  night-note-apricot: "#cba385"
  night-cover: "#070b1a"
  night-cover-deep: "#03060f"
  night-cover-ink: "#cfd9f2"
  night-paper: "#17213e"
  night-paper-shade: "#18223f"
  night-fill: "#1e2a4c"
  night-ruled-line: "#243258"
  night-hairline-rule: "#31416d"
  night-margin-rule: "#5b6fa6"
  night-ink: "#e3e9f8"
  night-faded-ink: "#a3b3db"
  night-accent: "#9fb4ea"
  night-on-accent: "#0d1530"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 66"
  title:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: "'wdth' 78"
  headline:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "12.5px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.16em"
    fontVariation: "'wdth' 72"
  apparatus:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'wdth' 92"
  body:
    fontFamily: "EB Garamond, Garamond, Times New Roman, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "28px"
  label:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.14em"
  mono:
    fontFamily: "JetBrains Mono, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.6
  hand:
    fontFamily: "Caveat, Segoe Print, cursive"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.15
rounded:
  hairline: "1px"
  sm: "2px"
  md: "3px"
  tab: "7px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "14px"
  lg: "16px"
  page: "22px"
  rule-line: "28px"
components:
  button-primary:
    backgroundColor: "{colors.navy-ink-accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.navy-black-ink}"
    textColor: "{colors.blue-white-paper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.navy-black-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.ink-wash-fill}"
  button-small:
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.blue-white-paper}"
    textColor: "{colors.navy-black-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
  vendor-monogram:
    backgroundColor: "transparent"
    textColor: "{colors.navy-black-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "0 3px"
    height: "18px"
  vendor-monogram-selected:
    backgroundColor: "{colors.navy-black-ink}"
    textColor: "{colors.blue-white-paper}"
  task-tag:
    backgroundColor: "transparent"
    textColor: "{colors.navy-black-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "1px 4px"
  file-status-added:
    backgroundColor: "{colors.navy-black-ink}"
    textColor: "{colors.blue-white-paper}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    size: "16px"
  file-status-modified:
    backgroundColor: "transparent"
    textColor: "{colors.navy-black-ink}"
    rounded: "{rounded.sm}"
    size: "16px"
  file-status-read:
    backgroundColor: "transparent"
    textColor: "{colors.faded-ink}"
    rounded: "{rounded.sm}"
    size: "16px"
  task-chip:
    backgroundColor: "{colors.blue-white-paper}"
    textColor: "{colors.navy-black-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "0 5px"
  fore-edge-tab:
    backgroundColor: "{colors.note-butter}"
    textColor: "{colors.on-note}"
    typography: "{typography.label}"
    rounded: "{rounded.tab}"
  fore-edge-tab-selected:
    rounded: "0 8px 8px 0"
  margin-note-button:
    backgroundColor: "{colors.on-note}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    height: "32px"
  margin-note:
    backgroundColor: "color-mix(in oklab, #f1df9c 55%, #f8faff)"
    textColor: "{colors.on-note}"
    rounded: "{rounded.hairline}"
    padding: "10px 12px 12px"
---

# Design System: orch Console

## Overview

**Creative North Star: "The Navy Notebook"**

orch is one hardcover notebook lying open on the desk. A woven navy bookcloth cover frames the viewport; a single blue-white page sits on it with a soft gutter shadow and a stack of page edges on the right; pastel index tabs are cut into the fore edge. Everything the user works with is written on that page: chat on ruled lines behind a double margin rule, the task graph on dot-grid paper, the repo tree as an indented contents list, worker questions on slightly askew sticky notes, a handwritten timeline. Night mode is the same notebook under a desk lamp: near-black cover, deep navy page with a faint radial lamp glow, blue-white ink, and tabs and notes in their own dimmed note colours.

The page has one hue. Every colour written on it is a shade of navy ink, from navy-black text through faded ink, rules and fills to the paper itself. Colour cannot carry meaning there, so meaning is carried by marks a pen can make: vendors by bordered two-letter monograms (CL, CX, GE, OL, GR, and "bạn" for the user), task states by fill pattern (solid, half-filled, dashed outline, hatched with a rotated stamp), file changes by a solid, outlined or dashed status box, heat by a diagonal hatch on the meter. The one exception, pinned by the user, is paper stuck onto the book: the fore-edge tabs and the question notes are soft pastel note paper. The interface is dense apparatus set in condensed Archivo, with Garamond reserved for sentences people write or read.

Confirmed rejections: the category's dark sidebar-plus-cards dashboard, and any multi-hue palette on the page, including per-vendor colours.

**Key Characteristics:**
- One navy hue on the page, light and night; colour only on stuck-on note paper (tabs, question notes).
- Bookcloth cover, one page, fore-edge index tabs as the only navigation.
- Ruled lines, double rules and dot grid drawn in CSS as the page's own furniture.
- Identity by monogram, state by fill pattern, never by colour.
- Four voices: condensed Archivo apparatus, Garamond prose, mono machine output, Caveat for margin notes only.
- Square-shouldered marks: 1-3px corners everywhere except the tabs.

## Colors

A single navy ink diluted to paper, plus six pastel note papers that live only on tabs and sticky notes.

### Primary
- **Navy Ink Accent** (`navy-ink-accent`): filled primary buttons, meter fills, sparkline bars, the running-node pulse, focus outlines, text selection and caret. In night mode it inverts to a pale lamp-lit blue (`night-accent`) carrying dark text (`night-on-accent`).

### Secondary
- **Note Papers** (`note-butter`, `note-sage`, `note-sky`, `note-rose`, `note-lilac`, `note-apricot`): one per fore-edge tab, in section order (Bàn làm việc, Thư mục, Quy tắc, Usage, Nhật ký, Giao diện). Question notes use butter, mixed 55% into paper by day.
- **Night Note Papers** (`night-note-butter` to `night-note-apricot`): the same six hues dimmed for the lamp-lit page; tabs use them directly and the night question note is solid night butter.
- **On Note** (`on-note`): all text, borders and the filled button on tabs and notes, the same in both themes.

### Neutral
- **Bookcloth Cover** (`bookcloth-cover`): the body background, woven by two 1px repeating gradients (light warp at 3.5% white, dark weft at 9% black, 3px pitch). Also the mobile tab rail.
- **Cover Deep** (`cover-deep`): corner guards (two clipped triangles at the left corners) and the bookmark ribbon.
- **Blue-White Paper** (`blue-white-paper`): the page, boxes, inputs, the index-card detail, diffs.
- **Paper Shade** (`paper-shade`): machine-output blocks, sticky table heads, diff headers, file-row hover, queued/blocked node fill, the alternating page-edge strokes.
- **Ink Wash Fill** (`ink-wash-fill`): the user's own chat lines, the selected vendor cell and file row, added diff lines, ghost-button hover.
- **Ruled Line** (`ruled-line`): writing lines under chat and AGENTS.md, table row rules, timeline and touch-list rules.
- **Hairline Rule** (`hairline-rule`): box borders, header dividers, the dot grid, page-edge strokes, quiet button borders.
- **Margin Rule** (`margin-rule`): the double margin rule in chat, every `3px double` rule (page header, margin column, ledger head, detail card), field underlines.
- **Navy-Black Ink** (`navy-black-ink`): text, solid fills for done/selected/added states, strong 1.5px borders, button hover fill.
- **Faded Ink** (`faded-ink`): secondary text, hints, labels, quiet borders, idle DAG edges, deleted diff lines, read-only file marks.

### Named Rules
**The One Ink Rule.** Everything written on the page is a shade of navy. A second hue on the page, including a red for errors, a green for additions or a colour per vendor, is a defect.

**The Note Paper Rule.** Colour is allowed only on paper stuck onto the book: the fore-edge tabs and the question notes, in the six note tokens with on-note text. It never marks state, vendor or data. This exception is user-pinned; do not extend it to other surfaces.

**The Pen Mark Rule.** Identity and state are drawn, not coloured: monogram box for vendor; solid, half, dashed, hatched for done, running, waiting, error; solid, outlined, dashed box for added, modified, read. If a distinction needs colour to be read, redesign the mark.

## Typography

**Display / Apparatus Font:** Archivo variable (with Arial Narrow), width axis 62-125
**Body Font:** EB Garamond (with Garamond, Times New Roman)
**Mono Font:** JetBrains Mono (with Consolas)
**Hand Font:** Caveat (with Segoe Print)

**Character:** Condensed Archivo is the printed form the notebook came with, headers, fields and labels; Garamond is what gets written on it. Mono is machine output pasted in; Caveat is the user's pen in the margin.

### Hierarchy
- **Display** (700, 34px, line-height 1, width 66%, uppercase): the printed section name in the page header; 26px under 860px.
- **Title** (700, 18px, 1.2, width 78%): the index-card task title. File paths in the file detail use mono 15px 600 instead.
- **Headline** (700, 12.5px, 1.2, width 72%, 0.16em, uppercase): box and fieldset headings (Chat, Đồ thị task, Dòng thời gian).
- **Apparatus** (400-600, 15px, 1.45, width 92%): the default UI voice; vendor names, tallies, tables and the tree (13.5px), hints (12px). DAG node titles (600, 13.5px) wrap to measured lines inside the node.
- **Body** (400, 17px on a 28px line): chat messages (max 62ch), report prose (16px/24px), notes (15px/1.5, max 68ch), inputs (16px).
- **Label** (600, 11px, 0.14em, uppercase): header fields (Trang, Ngày, Giờ), state badges, table heads (11-11.5px, 0.1em), buttons (13px, 0.12em, width 80%), tabs (12.5px, 0.16em, width 78%).
- **Mono** (400-600, 11-14px): IDs, monograms, file names (12.5px), timestamps, field values, command buttons, output blocks and diffs (12.5px/1.6-1.65).
- **Hand** (500, 20px, 1.15): question notes; 18px in the timeline.

### Named Rules
**The Margin Pen Rule.** Caveat appears only in the margin column (question notes, timeline) and the question quoted on a task card. Never on headings, buttons or data.

**The Tabular Rule.** Numbers in tallies, tables and meters use tabular figures.

## Layout

The viewport is the open book: an 18px cover margin top, bottom and left, a 58px fore-edge column on the right for tabs, and the page filling the rest (padding 16px 22px 26px 30px). Above 1280px the page is a fixed-height flex column, panels scroll internally and the body never scrolls. The header's page number follows the tab order: Bàn làm việc 01, Thư mục 02, then Quy tắc, Usage, Nhật ký, Giao diện.

The workspace stacks a printed header (closed by a 3px double rule), the tally line, a five-cell vendor strip, then three columns: chat `minmax(300px, .85fr)`, graph `minmax(0, 1.35fr)`, margin `268px`, at a 14px gap. While a task is selected, the index card takes the margin column's grid cell and the margin returns when the card closes; nothing overlays the graph. Thư mục is two boxes, tree `minmax(300px, .85fr)` and file detail `minmax(0, 1.3fr)`, under a toolbar of filters and the status legend. Quy tắc is two columns: on the left the AGENTS.md editor (growing, its status line hidden while empty) stacked over the "Mỗi agent đọc luật từ đâu" table at a 14px gap, on the right the skills box, which sizes to its content.

Rhythm runs on 4/8/12/16px with a 28px writing line (`--lh`); compact density drops padding to 10px, the line to 24px and vendor rows by 20%.

Responsive steps: at 1280px the body scrolls, chat gets a fixed 560px height and the graph grows to its content (minimum 560px, no inner scroll), and the margin column moves under them as a full-width two-column strip (the index card takes that full-width row instead while a task is selected); at 1180px the vendor strip wraps to three; at 860px columns dissolve into one ordered flow (tally, margin notes, vendors, graph, chat), vendor cells show only the first meter, Thư mục and Quy tắc stack to one column, the detail card becomes a bottom sheet, and the tabs move to a fixed bottom rail on the cover colour, turning horizontal with their rounded ends up; at 560px vendors go single-column and the bookmark ribbon is hidden.

## Elevation & Depth

Depth is physical and sparse. The page lies on the cover with an inset gutter shadow on its spine edge, a stack of five 1px page-edge strokes alternating paper shade and hairline on its right, and one soft drop shadow. Only two things rise off the page: the index-card detail and the question notes. Tabs carry a small cast shadow because they are cut paper standing off the edge.

### Shadow Vocabulary
- **Page on cover** (`inset 18px 0 22px -18px var(--shadow), 1px 0 0 var(--paper-2), 2px 0 0 var(--line-2), 3px 0 0 var(--paper-2), 4px 0 0 var(--line-2), 5px 1px 0 var(--paper-2), 8px 6px 18px var(--shadow)`): the page only.
- **Index card** (`3px 6px 16px var(--shadow)`): the task detail card, the one raised sheet.
- **Margin note** (`1px 2px 5px var(--shadow)`): question notes, rotated -0.7deg / +0.6deg alternately.
- **Tab** (`2px 2px 4px var(--shadow)`): fore-edge tabs.
- **Selected tab** (`3px 3px 8px var(--shadow)`): the active tab lying over the page edge.

`--shadow` is navy-black at 28% by day, black at 55% by night.

### Named Rules
**The One Raised Sheet Rule.** Boxes, tables, trees and inputs are flat, ruled on the page. Only the index card and question notes lift; nothing else gets a drop shadow.

## Shapes

Square, printed corners. Boxes, buttons, inputs, chips, monograms, status marks and badges use 2px; icon buttons 3px; question notes and checkboxes 1px; the page itself 2px at the spine, 3px at the fore edge. The only soft shape is the index tab (7px on its outer end, 8px when selected). Borders come in three weights: 1px hairline for structure, 1.5px ink for marks the user acts on, `3px double` for printed rules and the error state. Rotation is reserved for paper laid on the page: question notes, the error slip (-0.6deg) and the rate-limit stamp (-3deg). The tree's disclosure mark is a small CSS triangle that turns 90deg when open.

## Components

### Buttons
Printed, uppercase, square.
- **Shape:** 2px corners, 44px tall (32px small).
- **Primary:** navy ink fill with on-accent text, condensed Archivo 13px 600 at 0.12em, 16px side padding, optional 16px SVG arrow.
- **Hover:** fills with navy-black ink. **Focus:** 2px accent outline, 2px offset. **Disabled:** 45% opacity.
- **Ghost:** transparent with a 1.5px faded-ink border; hover darkens the border to ink and fills with ink wash.
- **Icon button:** 30px square, 1.5px faded-ink border, 3px corners, 16px inline SVG.
- **Command buttons:** mono 12px, 1px hairline border, 2px corners; border darkens on hover.

### Vendor Monogram
The vendor's identity. A 24 x 18px box with a 1.5px ink border, 2px corners and the two-letter code in mono 11px 600; the user is marked "bạn" in the same box. Selected (the strip filter) inverts to solid ink with paper text. Used in the vendor strip, ledger, log, rules table, touch lists and inside every DAG node.

### Quota Meter
An 8px track with a 1px faded-ink border on paper, filled with accent; past the threshold the fill becomes a -45deg hatch of accent and paper. A 1.5px dashed ink tick stands at 80%, the point where orch stops assigning work.

### Task Graph Nodes
Paper rectangles with a 1.25px faded-ink stroke on a 16px dot grid; titles and meta lines wrap to measured lines inside the node. A state box carries the pattern: done is solid ink with a paper tick, running is half-filled with a blinking accent pulse, queued/blocked/cancelled turn the node outline dashed (4 3) on paper shade, error is hatched and gets a rotated "rate limit" stamp. Hover and focus thicken the stroke; selection is a 3px accent stroke. Live edges are 2px ink, idle edges 1.25px faded ink.

### Index Card (detail)
A ruled box on paper that replaces the margin column while a task is selected (the full-width row below chat and graph at 1280px and under), with the index-card shadow and a 3px double margin-rule line 52px from the top. Title in Archivo 18px, state badge (label type, 1.5px ink border; running/done inverted; error as a 3px double border), a ruled key-value list, Garamond report prose, and an error slip with a 3px double ink border rotated -0.6deg. Becomes a bottom sheet under 860px.

### Margin Note
A butter note-paper slip (55% into paper by day, solid night butter by night) with 1px corners and the margin-note shadow, alternately tilted. Everything inside is on-note in both themes: header in apparatus 12px with a transparent on-note task chip, the question in Caveat 20px, a 32px answer field (white at 50% over the note, on-note border and text, #3d4870 placeholder) and a small button filled on-note with #f3f6fd text.

### Repo Tree and File Status
The Thư mục tree is native `details`/`summary`: folder names in mono 12.5px 600 with a CSS triangle and a mono 11px count of changes at the right, children indented 14px. Each file row is a three-part grid: a 16px status mark, the mono file name (ellipsis), and task tags for whoever touched it ("T-014 CX", or "bạn" for the user) in 11px mono 600 hairline boxes (1px faded-ink border, 2px corners); past two, a dashed "+n" tag. Status marks share one 1.5px ink box with a mono 11px 700 letter: **A** (added) solid ink with paper letter, **M** (modified) outline, **R** (read only) dashed outline in faded ink. Rows hover to paper shade; the current file is ink-wash fill and 600. Untouched files read in faded ink.

### File Detail
The file path in mono 15px, a state badge, then a touch list (ruled rows: monogram, task chip or "Bạn", action in faded ink, mono delta) and a diff box: hairline border, mono 12.5px/1.65, a paper-shade header, added lines filled with ink wash and prefixed "+", deleted lines struck through in faded ink and prefixed "−". No red or green.

### Inputs / Fields
- **Style:** paper fill, 1.5px faded-ink border, 2px corners, Garamond 16px, 9px 11px padding. Faded-ink placeholder, accent caret.
- **Focus:** border darkens to ink, no glow.
- **Select:** 32px, same border and corners.
- **Checkbox:** 18px square, 1.5px ink border, 1px corners; checked fills ink with a paper SVG tick.
- **Segmented control:** 1.5px ink border; the checked segment is solid ink with paper text. Used for preferences and the Thư mục filters (Tất cả / Có thay đổi / Bot đã đọc).
- **Header field:** label in 11px uppercase, value in mono 14px over a 1px margin-rule underline, like a printed form.

### Navigation
Fore-edge index tabs are the only navigation, six of them. Desktop: vertical text, condensed Archivo 12.5px 600 at 0.16em uppercase in on-note, each tab its own note paper in section order, heights weighted by section (workspace tallest). Hover slides a tab 4px further out. The selected tab keeps its colour, overlaps the page edge by 20px (the rail sits above the page), rounds to 8px, turns bold and takes the selected tab shadow. Under 860px they become a bottom rail of six horizontal tabs on the cover (11px, 0.02em), the selected one 10px taller.

### Writing Surfaces
Chat and AGENTS.md sit on ruled paper: horizontal 1px ruled lines every 28px, and in chat a double vertical margin rule at 34px and 37px. The Giao diện panel lets the user swap ruled for dot grid or plain; the graph is always dot grid unless plain is chosen.

## Do's and Don'ts

### Do:
- **Do** draw every colour on the page from the navy tokens; in night mode swap to the `night-` set.
- **Do** keep note-paper colour to the fore-edge tabs and question notes, with on-note text and controls in both themes.
- **Do** tell vendors apart with the monogram box and states with fill pattern (solid, half, dashed, hatched; solid, outline, dashed for file status).
- **Do** set apparatus in condensed Archivo, sentences in Garamond on the 28px line, machine output in mono.
- **Do** use `3px double` margin-rule lines for printed section breaks and 1px hairlines for structure.
- **Do** keep corners at 1-3px; only fore-edge tabs round to 7-8px.
- **Do** keep motion to the 160ms ink settle (`cubic-bezier(.16,1,.3,1)`) and the stepped running pulse, both off under reduced motion.

### Don't:
- **Don't** add a hue to the page: no per-vendor colours, no red error, no green addition, no note colours on data or state.
- **Don't** build a dark sidebar with cards; navigation stays on the fore edge.
- **Don't** use Caveat outside the margin column and the quoted task question.
- **Don't** give boxes, tables, trees or inputs drop shadows; only the index card and question notes lift.
- **Don't** use icon fonts or glyph icons; icons are inline SVG strokes in currentColor.
