# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Fixed

## [2.2.0] - 2026-11-21

### Added

-   Add label size selection (Standard, Medium, Large) with prominent unboxing warning
-   Dashboard v2: multi-file DO+IT grouped parser, Master Data outlet fuzzy match, review screen (phase 1 - parse only, additive, core untouched)
-   Dashboard v2: phase 2 - outlet confirm/correct, register-new (v1 typo-guard path), learned mappings per browser (additive, core untouched)
-   Dashboard v2 Phase 3: generate merged PL per outlet (Excel + labels, single/ZIP)
-   Security: idle auto-lock for shared PCs — 15m timer, 60s warning pill, password-only unlock, Lock-now button, multi-tab heartbeat (additive, core untouched)
-   Dashboard: calmer dropzone copy — document-first wording, dev trivia removed, EN+ID in sync (strings only)
-   Labels: red warning band with white text on Row 9 — matches approved mock
-   Labels: unboxing-video warning on Row 9 with delivery date — bold for B&W print, layout untouched
-   Copilot: expert knowledge for dus/delivery/review/audit + Local/Auto/Gemini provider switch — WIB-anchored periods, 14-case brain test green (additive)
-   Mail: detailed email templates — facts tables, dus usage table with total, preheaders, shared card grammar across scan + revision mails (same facts)
-   Scan: READY email notify — outlet/checker/dus/weight/delivery/ref to Notify-To list, fire-and-forget after confirm (additive, gate untouched)
-   Admin: Notify To recipients on Admin tab — master_data list feeding revision emails with env fallback, validated max-5 (additive)
-   Dashboard: koli box drop-in animation on file dragover — GPU-only bounce plus glow, reduced-motion safe (CSS only, drop logic untouched)
-   Scan: persist Surat Jalan refs + show Delivery Date and REF on verify page — source_ref column live first, display-only lines, legacy rows hide (additive)
-   Scan-flow: QR back in PL Row 12 scan band, Digital PL nav Admin-only, audit-sample banner with checklist deep-link (?dn=) — scan-confirm stays the fast default (additive)
-   Digital PL: resume collapsed — picker starts collapsed when a stored PL exists, expanded when nothing to resume (3-line polish)
-   Digital PL: per-row Koli chips plus alternating group banding — every SKU row self-identifies its koli, no more rowSpan ambiguity (visual only)
-   Digital PL: live updates via guarded 15s poll + tab-visible refetch — approve/reject lands without refresh, polls skip saving/modal/recent edits and never blank on failure (UI only, checklist logic untouched)
-   Revisions: approve/reject decisions — reject auto-restores prevQty with supersede guard, koli reinsert, check reset (additive, revise stays instant)
-   Revisions: non-blocking review queue + email notify — ack flags on history, admin-only ack endpoint, Revision Review card in Admin, Ack column on Live Board (additive, revise stays instant)
-   Live Board: From/To date filters on Dus Usage and Revision History — exports and totals follow the filtered set (UI only, packing logic untouched)
-   DUS: Dus Medium end-to-end + Live Board Dus Usage report with Excel/CSV export — capture on Digital PL + Scan, persist file+Supabase, per-date/outlet detail table (additive, packing logic untouched)
-   Digital PL: mobile-first koli cards below md — stacked card per koli with 52px targets, table stays desktop truth, scrollable filters, stacked dus steppers (UI only, checklist logic untouched)
-   Digital PL: field-staff overhaul — mission hero with progress ring, koli focus filters, 48px Pack targets, jump-to-next, dus steppers, sticky Done bar, guided revise modal (UI only, checklist logic untouched)
-   Digital PL: grouped-by-delivery-date picker with sticky section headers and collapsible summary bar — calm two-line rows, search composes (UI only, checklist logic untouched)
-   Delivery Date: persist export-attested delivery_date on packing_status (file+Supabase migration) and key Digital PL board on delivery day with legacy fallback (additive, packing logic untouched)
-   Digital PL: Today-only scope by WIB calendar date with All toggle — composes with search, empty-today shortcut (UI only, checklist logic untouched)
-   Digital PL: searchable PL picker — filter pending by PL number, outlet, or checker with tap rows (UI only, checklist logic untouched)
-   Mobile: route-scoped field access — Digital PL, Scan, Login open on mobile, office pages stay desktop-gated, touch devices skip desktop DevTools traps (additive, packing logic untouched)
-   Labels: stamp Tgl Kirim delivery date on Row 9 spacer — same getDeliveryDateWIB source as PL (additive, packing logic untouched)
-   Dashboard: flagship System Actions pipeline — numbered Scan/Calculate/Export steps, ghost Live Sync, danger-zone Clear, drop dead shortcuts (UI only, packing logic untouched)
-   Dashboard: flagship outlet preview identity card — navy header, status pill, copy phone, address accent (UI only, packing logic untouched)
-   Auth: Admin Panel Super Admin only — Admin keeps Dashboard/Digital PL/Live Board (role gate, nothing else)

### Fixed

-   API: ES module `__dirname` + `require.main` compatibility; docs: agent contract + architecture/state/decisions/labels
-   Labels: correct dynamic label block width and row-height metrics for Medium and Large templates
-   Live Board: uncapped data (packing_status + item_usage range paging)
-   Uncapped fetching for packing_status and item_usage
-   Dashboard v2: match v1's delivered quantities exactly (verified vs 5 real PLs)
-   Dashboard: dragenter counter ends dropzone flicker — child crossings no longer strobe the animation (events only, file handling untouched)
-   Labels: Row 9 height 30 to 44pt — fits date plus wrapped warning incl. emoji line-box, no clipping
-   Copilot: Gemini resilience — retry once on 503/429, actionable error hints, surfaced failure detail in chat (additive)
-   Scan: mobile-first verify page — border-box layout, 2x2 labeled dus grid, 16px inputs, 52px targets, styled reject/404 (same POST contract)
-   Scan: serve HTML verify page on GET /scan/:delivery_no — QR scans land on checker confirm instead of JSON stub (shared helper, gate intact)
-   Digital PL: version-gated polls, per-koli in-flight lock, persist selected PL — stale snapshots never painted, double-taps can't interleave, remount resumes same PL (checklist-saving hardened)
-   Digital PL: search perf for weak phones — 250ms debounce, 80-row render cap, null-guards, picker error boundary (same results, UI only)
