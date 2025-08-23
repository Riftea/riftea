// scripts/updateImports.js
// 🔄 Script para actualizar imports automáticamente después de la migración

const fs = require('fs');
const path = require('path');

// Mapeo de imports antiguos → nuevos
const importMappings = {
  '@/lib/prisma': '@/src/lib/prisma',
  '@/lib/auth': '@/src/lib/auth',
  '@/lib/generateTickets': '@/src/lib/generateTickets',
  '@/lib/crypto': '@/src/lib/crypto',
  '@/hooks/useUser': '@/src/hooks/useUser',
  '@/components/': '@/src/components/',
  '../components/': '@/src/components/',
  './components/': '@/src/components/',
};

// Archivos a procesar
const filesToUpdate = [
  'app/api/**/*.js',
  'app/**/*.js',
  'app/**/*.jsx',
  'src/**/*.js',
  'src/**/*.jsx',
];

function updateImports(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;

    Object.entries(importMappings).forEach(([oldPath, newPath]) => {
      // Actualizar imports con from
      const fromRegex = new RegExp(`from ['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g');
      if (content.match(fromRegex)) {
        content = content.replace(fromRegex, `from '${newPath}'`);
        updated = true;
      }

      // Actualizar imports dinámicos
      const dynamicRegex = new RegExp(`import\\(['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\)`, 'g');
      if (content.match(dynamicRegex)) {
        content = content.replace(dynamicRegex, `import('${newPath}')`);
        updated = true;
      }

      // Actualizar requires
      const requireRegex = new RegExp(`require\\(['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\)`, 'g');
      if (content.match(requireRegex)) {
        content = content.replace(requireRegex, `require('${newPath}')`);
        updated = true;
      }
    });

    if (updated) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Actualizado: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error procesando ${filePath}:`, error.message);
  }
}

// Función recursiva para procesar directorios
function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      processDirectory(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      updateImports(filePath);
    }
  });
}

console.log('🔄 Actualizando imports...');

// Procesar directorios
['app', 'src'].forEach(dir => {
  if (fs.existsSync(dir)) {
    processDirectory(dir);
  }
});

console.log('✅ Imports actualizados!');

// Generar reporte de archivos modificados
console.log('\n📊 Reporte:');
console.log('   - Buscar manualmente imports que empiecen con "./" o "../"');
console.log('   - Verificar que no haya imports duplicados');
console.log('   - Ejecutar: npm run dev para probar');