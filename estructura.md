
```
riftea
├─ eslint.config.mjs
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
│  │  └─ migration_lock.toml
│  └─ schema.prisma
├─ public
│  ├─ file.svg
│  ├─ globe.svg
│  ├─ logo.png
│  ├─ next.svg
│  ├─ vercel.svg
│  └─ window.svg
├─ scripts
│  ├─ listUsers.js
│  └─ updateImports.js
├─ src
│  ├─ app
│  │  ├─ admin
│  │  │  ├─ crear-sorteo
│  │  │  │  └─ page.js
│  │  │  ├─ generar-tickets
│  │  │  │  └─ page.js
│  │  │  ├─ page.js
│  │  │  └─ raffles
│  │  │     └─ [id]
│  │  │        └─ page.js
│  │  ├─ api
│  │  │  ├─ admin
│  │  │  │  ├─ generar-tickets
│  │  │  │  │  └─ route.js
│  │  │  │  ├─ raffles
│  │  │  │  │  └─ [id]
│  │  │  │  │     └─ route.js
│  │  │  │  ├─ sorteos
│  │  │  │  │  └─ route.js
│  │  │  │  └─ usuarios
│  │  │  │     └─ route.js
│  │  │  ├─ auth
│  │  │  │  └─ [...nextauth]
│  │  │  │     └─ route.js
│  │  │  ├─ notifications
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
│  │  │  │     └─ route.js
│  │  │  ├─ tickets
│  │  │  │  ├─ my
│  │  │  │  │  └─ route.js
│  │  │  │  ├─ route.js
│  │  │  │  └─ use
│  │  │  │     └─ route.js
│  │  │  └─ users
│  │  │     └─ me
│  │  │        └─ route.js
│  │  ├─ estadisticas
│  │  │  └─ page.js
│  │  ├─ favicon.ico
│  │  ├─ globals.css
│  │  ├─ hooks
│  │  │  └─ useUser.js
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
│  │  ├─ crypto.js
│  │  ├─ generateTickets.js
│  │  ├─ prisma.js
│  │  └─ queue.js
│  ├─ pages
│  ├─ services
│  │  ├─ audit.service.js
│  │  ├─ purchases.service.js
│  │  └─ tickets.service.js
│  ├─ styles
│  ├─ tests
│  ├─ types
│  ├─ utils
│  ├─ validators
│  └─ workers
│     └─ worker.js
├─ tests
├─ tsconfig.json
├─ _backup_app_20250824
│  ├─ admin
│  │  ├─ crear-sorteo
│  │  │  └─ page.js
│  │  ├─ page.js
│  │  └─ raffles
│  │     └─ [id]
│  │        └─ page.js
│  ├─ api
│  │  ├─ auth
│  │  │  └─ [...nextauth]
│  │  │     └─ route.js
│  │  ├─ notifications
│  │  │  └─ route.js
│  │  ├─ purchase.js
│  │  ├─ purchases
│  │  │  └─ my-sales
│  │  │     └─ route.js
│  │  ├─ raffles
│  │  │  ├─ route.js
│  │  │  └─ [id]
│  │  │     ├─ assign-tickets
│  │  │     │  └─ route.js
│  │  │     └─ route.js
│  │  ├─ tickets
│  │  │  └─ my
│  │  │     └─ route.js
│  │  └─ users
│  │     └─ me
│  │        └─ route.js
│  ├─ estadisticas
│  │  └─ page.js
│  ├─ favicon.ico
│  ├─ globals.css
│  ├─ hooks
│  │  └─ useUser.js
│  ├─ layout.js
│  ├─ mis-sorteos
│  │  └─ page.js
│  ├─ mis-tickets
│  │  └─ page.js
│  ├─ notificaciones
│  │  └─ page.js
│  ├─ page.js
│  ├─ perfil
│  │  └─ page.js
│  ├─ providers.js
│  ├─ soporte
│  │  └─ page.js
│  ├─ sorteo
│  │  └─ [id]
│  │     └─ page.js
│  ├─ terminos
│  │  └─ page.js
│  └─ ventas
│     └─ page.js
└─ _backup_old_structure

```