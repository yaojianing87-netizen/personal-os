---
name: Notes and Inspiration roles
description: Freeform-style Notes boards and the separate Inspiration module.
---

Notes and Inspiration are separate modules. On 2026-11-17 the user replaced the Notes folder/list/editor layout with a Freeform-style board gallery and free-position canvas. Each board has a title, a content thumbnail and an updated time; users can add, edit, move, resize and delete sticky notes, text, shapes, images and drawings. Keep undo/redo, board deletion recovery, zoom/pan and local autosave working.

**Why:** The user explicitly requested the Apple Freeform-style board overview and canvas, replacing the old Notes presentation. This supersedes the previous folder hierarchy requirement for Notes.

**How to apply:** Keep Notes and Inspiration independent. Store boards under `atelier-note-boards`; on first use migrate every old note to a board and retain the original `atelier-notes` data as a backup. Do not resurrect old notes after the user has deleted their migrated boards. Preserve the hidden legacy DOM only as needed for existing `app.js` startup compatibility; the visible Notes experience is exclusively the board UI.
