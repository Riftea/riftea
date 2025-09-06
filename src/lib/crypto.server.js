// src/lib/crypto.server.js
import 'server-only';

// Reexporta TODA la lógica desde ./crypto para evitar divergencias.
// Usá este import en cualquier código del servidor (rutas API, acciones, etc).
export * from './crypto';
