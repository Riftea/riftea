#!/bin/bash
# 🚀 Script de migración automática para Riftea
# Ejecutar desde la raíz del proyecto

echo "🎯 Iniciando migración de estructura..."

# 1️⃣ Crear estructura src/
echo "📁 Creando estructura src/..."
mkdir -p src/{components/{ui,raffle,auth,layout},services,lib,jobs,workers,hooks,utils,validators}
mkdir -p app/terminos

# 2️⃣ Mover archivos existentes (con backup)
echo "💾 Creando backups..."
mkdir -p _backup_old_structure
cp -r app _backup_old_structure/
cp -r lib _backup_old_structure/ 2>/dev/null || true

# 3️⃣ Migrar lib/ a src/lib/
echo "📚 Migrando lib/ → src/lib/..."
if [ -d "lib" ]; then
  cp lib/prisma.js src/lib/ 2>/dev/null || true
  cp lib/auth.js src/lib/ 2>/dev/null || true
  cp lib/generateTickets.js src/lib/ 2>/dev/null || true
fi

# 4️⃣ Migrar hooks/
echo "🪝 Migrando hooks/ → src/hooks/..."
if [ -d "app/hooks" ]; then
  cp app/hooks/* src/hooks/ 2>/dev/null || true
fi

# 5️⃣ Migrar components/
echo "🧩 Migrando components/ → src/components/..."
if [ -d "app/components" ]; then
  cp -r app/components/* src/components/ 2>/dev/null || true
fi

# 6️⃣ Actualizar jsconfig.json para nuevos paths
echo "⚙️ Actualizando jsconfig.json..."
cat > jsconfig.json << 'EOF'
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/src/*": ["./src/*"],
      "@/app/*": ["./app/*"],
      "@/components/*": ["./src/components/*"],
      "@/services/*": ["./src/services/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/utils/*": ["./src/utils/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
EOF

echo "✅ Migración completada!"
echo "🔥 Próximos pasos:"
echo "   1. Ejecutar: npm install uuid bullmq ioredis zod"
echo "   2. Actualizar imports en archivos API"
echo "   3. Probar: npm run dev"
echo ""
echo "📁 Archivos respaldados en: _backup_old_structure/"