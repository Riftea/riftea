
```
riftea
├─ eslint.config.mjs
├─ estructura.md
├─ jsconfig.json
├─ logo.png
├─ migration_script.sh
├─ next.config.mjs
├─ package-lock.json
├─ package.json
├─ postcss.config.mjs
├─ prisma
│  ├─ enable_rls.sql
│  ├─ migrations
│  │  ├─ 20250812091137_initial_setup
│  │  │  └─ migration.sql
│  │  ├─ 20250816094904_add_role_field
│  │  │  └─ migration.sql
│  │  ├─ 20250816201834_add_notifications
│  │  │  └─ migration.sql
│  │  ├─ 20250816232332_add_audit_log
│  │  │  └─ migration.sql
│  │  ├─ 20250817091509_add_enhanced_raffle_features
│  │  │  └─ migration.sql
│  │  ├─ 20250904072220_add_ticket_fields
│  │  │  └─ migration.sql
│  │  └─ migration_lock.toml
│  └─ schema.prisma
├─ public
│  ├─ avatar-default.png
│  ├─ file.svg
│  ├─ globe.svg
│  ├─ logo.png
│  ├─ next.svg
│  ├─ uploads
│  │  ├─ 4d1083518c414a9281a617c68a1fc3cb.webp
│  │  ├─ 4d1083518c414a9281a617c68a1fc3cb_thumb.webp
│  │  ├─ 71b88485515b4bd6ad50397d9ac408c4.webp
│  │  ├─ 71b88485515b4bd6ad50397d9ac408c4_thumb.webp
│  │  ├─ bab06c9715e9453faa9db34188dcc3dd.webp
│  │  ├─ bab06c9715e9453faa9db34188dcc3dd_thumb.webp
│  │  ├─ c8724f1f575c4e71a144be367b279580.webp
│  │  ├─ c8724f1f575c4e71a144be367b279580_thumb.webp
│  │  ├─ d4efb0206bca4b8f8ef8bb7683a5c2cd.webp
│  │  ├─ d4efb0206bca4b8f8ef8bb7683a5c2cd_thumb.webp
│  │  ├─ d519f6ce5b8c4b5ea0a90efe54c537bc.webp
│  │  ├─ d519f6ce5b8c4b5ea0a90efe54c537bc_thumb.webp
│  │  ├─ d80d1f1345ab4974b7c19ac9c9b10956.webp
│  │  ├─ d80d1f1345ab4974b7c19ac9c9b10956_thumb.webp
│  │  ├─ f4ced4d12032470bbeae02ab69b6d042.webp
│  │  ├─ f4ced4d12032470bbeae02ab69b6d042_thumb.webp
│  │  ├─ fd8b55917af6410c89b9d2618b88b5f9.webp
│  │  └─ fd8b55917af6410c89b9d2618b88b5f9_thumb.webp
│  ├─ vercel.svg
│  └─ window.svg
├─ scripts
│  ├─ listUsers.js
│  ├─ updateImports.js
│  └─ verifyTicket.js
├─ src
│  ├─ app
│  │  ├─ admin
│  │  │  ├─ crear-sorteo
│  │  │  │  └─ page.js
│  │  │  ├─ generar-tickets
│  │  │  │  └─ page.js
│  │  │  ├─ page.js
│  │  │  ├─ raffles
│  │  │  │  └─ [id]
│  │  │  │     └─ page.js
│  │  │  └─ usuarios
│  │  │     └─ page.js
│  │  ├─ api
│  │  │  ├─ admin
│  │  │  │  ├─ generar-tickets
│  │  │  │  │  └─ route.js
│  │  │  │  ├─ raffles
│  │  │  │  │  └─ [id]
│  │  │  │  │     └─ route.js
│  │  │  │  ├─ sorteos
│  │  │  │  │  └─ route.js
│  │  │  │  ├─ tickets
│  │  │  │  │  └─ issue
│  │  │  │  │     └─ route,js
│  │  │  │  └─ usuarios
│  │  │  │     └─ route.js
│  │  │  ├─ auth
│  │  │  │  └─ [...nextauth]
│  │  │  │     └─ route.js
│  │  │  ├─ notifications
│  │  │  │  └─ route.js
│  │  │  ├─ ping
│  │  │  │  └─ route.js
│  │  │  ├─ purchases
│  │  │  │  ├─ my-sales
│  │  │  │  │  └─ route.js
│  │  │  │  └─ route.js
│  │  │  ├─ raffles
│  │  │  │  ├─ route.js
│  │  │  │  └─ [id]
│  │  │  │     ├─ assign-tickets
│  │  │  │     │  └─ route.js
│  │  │  │     ├─ participate
│  │  │  │     │  └─ route.js
│  │  │  │     ├─ progress
│  │  │  │     │  └─ route.js
│  │  │  │     └─ route.js
│  │  │  ├─ tickets
│  │  │  │  ├─ issue
│  │  │  │  │  └─ route.js
│  │  │  │  ├─ my
│  │  │  │  │  └─ route.js
│  │  │  │  ├─ route.js
│  │  │  │  ├─ use
│  │  │  │  │  └─ route.js
│  │  │  │  └─ verify
│  │  │  │     └─ route.js
│  │  │  ├─ uploads
│  │  │  │  └─ route.js
│  │  │  └─ users
│  │  │     └─ me
│  │  │        └─ route.js
│  │  ├─ estadisticas
│  │  │  └─ page.js
│  │  ├─ favicon.ico
│  │  ├─ globals.css
│  │  ├─ layout.js
│  │  ├─ mis-sorteos
│  │  │  └─ page.js
│  │  ├─ mis-tickets
│  │  │  └─ page.js
│  │  ├─ notificaciones
│  │  │  └─ page.js
│  │  ├─ page.js
│  │  ├─ perfil
│  │  │  └─ page.js
│  │  ├─ providers.js
│  │  ├─ soporte
│  │  │  └─ page.js
│  │  ├─ sorteo
│  │  │  └─ [id]
│  │  │     └─ page.js
│  │  ├─ terminos
│  │  │  └─ page.js
│  │  └─ ventas
│  │     └─ page.js
│  ├─ components
│  │  ├─ admin
│  │  │  └─ AdminTicketGenerator.jsx
│  │  ├─ auth
│  │  ├─ AuthButtons.jsx
│  │  ├─ header
│  │  │  └─ Header.jsx
│  │  ├─ layout
│  │  ├─ raffle
│  │  │  ├─ ParticipateModal.jsx
│  │  │  └─ ProgressBar.js
│  │  ├─ tickets
│  │  │  └─ UserTicketsDisplay.jsx
│  │  └─ ui
│  ├─ contexts
│  │  └─ NotificationsContext.js
│  ├─ hooks
│  │  ├─ useProgress.js
│  │  └─ useUser.js
│  ├─ jobs
│  │  └─ checkProgress.js
│  ├─ lib
│  │  ├─ auth-utils.js
│  │  ├─ auth.js
│  │  ├─ authz.js
│  │  ├─ crypto.js
│  │  ├─ crypto.server.js
│  │  ├─ generateTickets.js
│  │  ├─ prisma.js
│  │  └─ queue.js
│  ├─ server
│  │  └─ tickets.js
│  ├─ services
│  │  ├─ audit.service.js
│  │  ├─ purchases.service.js
│  │  ├─ raffles.service.js
│  │  └─ tickets.service.js
│  ├─ tests
│  ├─ types
│  ├─ utils
│  ├─ validators
│  └─ workers
│     └─ worker.js
├─ tests
│  └─ scripts
└─ tsconfig.json

```