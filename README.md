
```
riftea
├─ app
│  ├─ admin
│  │  ├─ crear-sorteo
│  │  │  └─ page.js
│  │  └─ page.js
│  ├─ api
│  │  ├─ auth
│  │  │  └─ [...nextauth]
│  │  │     └─ route.js
│  │  ├─ notifications
│  │  │  └─ route.js
│  │  ├─ purchase.js
│  │  ├─ raffles
│  │  │  ├─ route.js
│  │  │  └─ [id]
│  │  │     ├─ assign-tickets
│  │  │     │  └─ route.js
│  │  │     ├─ page.js
│  │  │     └─ route.js
│  │  ├─ tickets
│  │  │  └─ route.js
│  │  └─ users
│  │     └─ me
│  │        └─ route.js
│  ├─ components
│  │  ├─ AuthButtons.jsx
│  │  └─ header
│  │     └─ Header.jsx
│  ├─ favicon.ico
│  ├─ globals.css
│  ├─ hooks
│  │  └─ useUser.js
│  ├─ layout.js
│  ├─ mis-sorteos
│  │  └─ page.js
│  ├─ page.js
│  └─ providers.js
├─ db.js
├─ eslint.config.mjs
├─ jsconfig.json
├─ lib
│  ├─ auth.js
│  ├─ generateTickets.js
│  └─ prisma.js
├─ logo.png
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
│  └─ listUsers.js
└─ tsconfig.json

```
```
riftea
├─ app
│  ├─ admin
│  │  ├─ crear-sorteo
│  │  │  └─ page.js
│  │  └─ page.js
│  ├─ api
│  │  ├─ auth
│  │  │  └─ [...nextauth]
│  │  │     └─ route.js
│  │  ├─ notifications
│  │  │  └─ route.js
│  │  ├─ purchase
│  │  │  └─ route.js
│  │  ├─ purchase.js
│  │  ├─ raffles
│  │  │  ├─ route.js
│  │  │  └─ [id]
│  │  │     ├─ assign-tickets
│  │  │     │  └─ route.js
│  │  │     ├─ page.js
│  │  │     └─ route.js
│  │  ├─ tickets
│  │  │  └─ route.js
│  │  └─ users
│  │     └─ me
│  │        └─ route.js
│  ├─ components
│  │  ├─ AuthButtons.jsx
│  │  └─ header
│  │     └─ Header.jsx
│  ├─ favicon.ico
│  ├─ globals.css
│  ├─ hooks
│  │  └─ useUser.js
│  ├─ layout.js
│  ├─ mis-sorteos
│  │  └─ page.js
│  ├─ page.js
│  ├─ providers.js
│  └─ terminos
│     └─ page.js
├─ db.js
├─ eslint.config.mjs
├─ jsconfig.json
├─ lib
│  ├─ auth.js
│  └─ generateTickets.js
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
├─ README.md
├─ scripts
│  ├─ listUsers.js
│  └─ updateImports.js
├─ src
│  ├─ api
│  ├─ components
│  │  ├─ auth
│  │  ├─ AuthButtons.jsx
│  │  ├─ header
│  │  │  └─ Header.jsx
│  │  ├─ layout
│  │  ├─ raffle
│  │  │  └─ ProgressBar.js
│  │  └─ ui
│  ├─ hooks
│  │  ├─ useProgress.js
│  │  └─ useUser.js
│  ├─ jobs
│  │  └─ checkProgress.js
│  ├─ lib
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
│  ├─ utils
│  ├─ validators
│  └─ workers
│     └─ worker.js
├─ tests
├─ tsconfig.json
└─ _backup_old_structure
   ├─ app
   │  ├─ admin
   │  │  ├─ crear-sorteo
   │  │  │  └─ page.js
   │  │  └─ page.js
   │  ├─ api
   │  │  ├─ auth
   │  │  │  └─ [...nextauth]
   │  │  │     └─ route.js
   │  │  ├─ notifications
   │  │  │  └─ route.js
   │  │  ├─ purchase
   │  │  │  └─ route.js
   │  │  ├─ purchase.js
   │  │  ├─ raffles
   │  │  │  ├─ route.js
   │  │  │  └─ [id]
   │  │  │     ├─ assign-tickets
   │  │  │     │  └─ route.js
   │  │  │     ├─ page.js
   │  │  │     └─ route.js
   │  │  ├─ tickets
   │  │  │  └─ route.js
   │  │  └─ users
   │  │     └─ me
   │  │        └─ route.js
   │  ├─ components
   │  │  ├─ AuthButtons.jsx
   │  │  └─ header
   │  │     └─ Header.jsx
   │  ├─ favicon.ico
   │  ├─ globals.css
   │  ├─ hooks
   │  │  └─ useUser.js
   │  ├─ layout.js
   │  ├─ mis-sorteos
   │  │  └─ page.js
   │  ├─ page.js
   │  ├─ providers.js
   │  └─ terminos
   │     └─ page.js
   └─ lib
      ├─ auth.js
      └─ generateTickets.js

```
```
riftea
├─ app
│  ├─ admin
│  │  ├─ crear-sorteo
│  │  │  └─ page.js
│  │  └─ page.js
│  ├─ api
│  │  ├─ auth
│  │  │  └─ [...nextauth]
│  │  │     └─ route.js
│  │  ├─ notifications
│  │  │  └─ route.js
│  │  ├─ purchase
│  │  │  └─ route.js
│  │  ├─ purchase.js
│  │  ├─ raffles
│  │  │  ├─ route.js
│  │  │  └─ [id]
│  │  │     ├─ assign-tickets
│  │  │     │  └─ route.js
│  │  │     ├─ page.js
│  │  │     └─ route.js
│  │  ├─ tickets
│  │  │  └─ my
│  │  │     └─ route.js
│  │  └─ users
│  │     └─ me
│  │        └─ route.js
│  ├─ components
│  │  ├─ AuthButtons.jsx
│  │  └─ header
│  │     └─ Header.jsx
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
├─ db.js
├─ eslint.config.mjs
├─ jsconfig.json
├─ lib
│  ├─ auth.js
│  └─ generateTickets.js
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
├─ README.md
├─ scripts
│  ├─ listUsers.js
│  └─ updateImports.js
├─ src
│  ├─ api
│  ├─ components
│  │  ├─ auth
│  │  ├─ AuthButtons.jsx
│  │  ├─ header
│  │  │  └─ Header.jsx
│  │  ├─ layout
│  │  ├─ raffle
│  │  │  └─ ProgressBar.js
│  │  └─ ui
│  ├─ hooks
│  │  ├─ useProgress.js
│  │  └─ useUser.js
│  ├─ jobs
│  │  └─ checkProgress.js
│  ├─ lib
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
│  ├─ utils
│  ├─ validators
│  └─ workers
│     └─ worker.js
├─ tests
├─ tsconfig.json
└─ _backup_old_structure
   ├─ app
   │  ├─ admin
   │  │  ├─ crear-sorteo
   │  │  │  └─ page.js
   │  │  └─ page.js
   │  ├─ api
   │  │  ├─ auth
   │  │  │  └─ [...nextauth]
   │  │  │     └─ route.js
   │  │  ├─ notifications
   │  │  │  └─ route.js
   │  │  ├─ purchase
   │  │  │  └─ route.js
   │  │  ├─ purchase.js
   │  │  ├─ raffles
   │  │  │  ├─ route.js
   │  │  │  └─ [id]
   │  │  │     ├─ assign-tickets
   │  │  │     │  └─ route.js
   │  │  │     ├─ page.js
   │  │  │     └─ route.js
   │  │  ├─ tickets
   │  │  │  └─ route.js
   │  │  └─ users
   │  │     └─ me
   │  │        └─ route.js
   │  ├─ components
   │  │  ├─ AuthButtons.jsx
   │  │  └─ header
   │  │     └─ Header.jsx
   │  ├─ favicon.ico
   │  ├─ globals.css
   │  ├─ hooks
   │  │  └─ useUser.js
   │  ├─ layout.js
   │  ├─ mis-sorteos
   │  │  └─ page.js
   │  ├─ page.js
   │  ├─ providers.js
   │  └─ terminos
   │     └─ page.js
   └─ lib
      ├─ auth.js
      └─ generateTickets.js

```