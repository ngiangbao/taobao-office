# Chie House

[Tiếng Việt](README.md) · **English**

A desktop app (Windows / macOS / Linux) for small shops that source from Taobao / 1688 and sell on Facebook. You chat with a team of Claude agents; they browse the web with your own logged-in Chrome to find products, quote prices, draft posts and look after customers. A 3D office (built on the My Office project) next to the chat shows what each agent is doing.

> The app's interface and agent replies are in **Vietnamese**. This page is an English overview for GitHub readers.

![Chie House 3D office](docs/screenshots/van-phong.png)

| Inventory (local Excel file) | Customers and orders |
|---|---|
| ![Inventory settings](docs/screenshots/cai-dat-kho-hang.png) | ![Customer settings](docs/screenshots/cai-dat-khach-hang.png) |

*Screenshots use sample data, not real shop data.*

## How it works
- **One chat: the office group chat.** You type (or send a photo); the app routes the message to the right agent. Address one directly with `@Name`.
- **Each agent is a separate "person"**: its own headless Claude Code session (`claude -p`, resumed with `--resume`) with its own context. Built-in roles: Inventory, Personal assistant, Comment replies, Customer care, Product search, Quoting, Posting, Lead finding.
- **Agents hand work to each other** with `[[GIAO @Name]] … [[/GIAO]]` blocks (at most 8 hops per chain), e.g. Customer care → Product search (with the customer's photo) → Quoting → back to Customer care with the final price.
- **Uses the `claude` CLI already logged in on your machine.** The app never stores your Claude, Facebook, Taobao or Google passwords; you log in to those sites yourself in the app's Chrome window.
- **Shared browser**: one Chrome window, one tab per agent. Chrome is opened lazily, only when an agent actually uses a browser tool, and closed when idle.
- **Chat history** is kept locally (`history/YYYY-MM.jsonl`) and is searchable and deletable.
- **Auto-update** from GitHub Releases (Windows, Linux AppImage). macOS builds are ad-hoc signed, not notarized: on first launch right-click → Open, or allow it in System Settings → Privacy & Security.

## Approval queue: agents cannot post on their own
- Ordinary agents can only view, navigate and scroll. Click / type / form-fill tools are blocked with `--disallowedTools`, which overrides your own `~/.claude` config.
- To post or comment, an agent submits a **proposal** (`[[DE_XUAT]]`). You review and edit it, then approve. A separate "publisher" run, the only one allowed to act in the browser, posts exactly the approved text (content is locked by hash).
- Optional per-channel auto-post (off by default) approves proposals after a delay you set. Posting is spaced out, limited to Facebook links, and never auto-retried after a crash mid-post.
- **Posting targets**: your personal profile and your own public group (links in Settings), plus other groups from a list you import (Excel / CSV / Google Sheets / Drive). Empty link = no posting there.
- **Product photos folder**: `anh-san-pham/` in the data folder is shared by the inventory, search and posting agents (not by customer agents). Stock photos are copied there automatically and named by product code (`CODE_001.jpg`, `CODE_002.jpg` for extra photos). Photos flagged as low resolution can be replaced by the search agent with a sharper one.

## Inventory and customers: two local Excel files
- **Inventory** (`du-lieu/kho-hang.xlsx`): imported once from an Excel file, a Google Sheets link or KiotViet, then updated in place. New items found by the search agent are inserted as the last row of the right category, in the sheet's own format. Exportable.
- **Customers** (`du-lieu/khach-hang.xlsx`): two sheets, *Customers* (ID and details) and *Orders* (waiting for stock, ordered, arrived, delivered, cancelled). It is kept up to date automatically; it is a mirror of the app's data, so manual edits in Excel are not read back.
- **KiotViet sync** (one-way, KiotViet → app): customers, invoices/orders and products. Field mapping is documented in [docs/KIOTVIET.md](docs/KIOTVIET.md) and has not yet been verified against a live account.
- **One customer-care agent per customer, created lazily**: importing a customer list creates no agents. An agent is created only when the customer messages you or you call `@Customer Name`. Real names and phone numbers are replaced by an ID (`KH-7F3K9`) when work is handed to other agents.
- **Revenue** counts only money you confirm as received.

## Run from source
```bash
npm install
npm run prepare:office   # build the embedded 3D office once
npm start
```
Tests (free, use fake agents): `node --test tests/`.
Packaging: `npm run dist:linux` / `dist:win` (on Windows) / `dist:mac` (on macOS). Releases are built by CI for all three platforms when a `v*` tag is pushed to `main`.

Requirements: Node 20+, Claude Code installed and logged in, Chrome/Chromium.

## Status and known limits
- Verified with unit/integration tests and fake agents; **not yet verified against real Facebook posting, Messenger, live KiotViet, or on real Windows/macOS machines.**
- Facebook automation can break when Facebook changes its UI, and may violate Facebook's terms for your account; always keep the approval step on.
- Secrets fall back to plain text in the config file when the OS keyring (Electron `safeStorage`) is unavailable.

## License
MIT. The embedded 3D office is derived from [My Office](https://github.com/khanh020905/my-office) (MIT); local patches are listed in `office/UPSTREAM.md`.
