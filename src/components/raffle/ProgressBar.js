// src/components/raffle/ProgressBar.js - VERSIÓN ACTUALIZADA
import React, { useEffect, useState } from 'react';

const ProgressBar = ({ 
  current = 0, 
  target = 100, 
  title = "Progreso del Sorteo",
  animated = true,
  showNotifications = true,
  currency = "ARS",
  raffleStatus = "ACTIVE"
}) => {
  const [displayPercent, setDisplayPercent] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  
  const actualPercent = Math.min((current / target) * 100, 100);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayPercent(actualPercent);
      
      if (actualPercent >= 100 && !isComplete) {
        setIsComplete(true);
        setJustCompleted(true);
        
        // Ocultar notificación después de 3s
        setTimeout(() => setJustCompleted(false), 3000);
      }
    }, 200);
    
    return () => clearTimeout(timer);
  }, [actualPercent, isComplete]);

  const getProgressColor = () => {
    if (isComplete) return 'from-green-400 via-emerald-500 to-green-600';
    if (displayPercent > 75) return 'from-amber-400 via-orange-500 to-red-500';
    if (displayPercent > 50) return 'from-blue-400 via-purple-500 to-pink-500';
    return 'from-cyan-400 via-blue-500 to-indigo-600';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusMessage = () => {
    if (raffleStatus === 'FINISHED') return '🏆 Sorteo Finalizado';
    if (raffleStatus === 'CANCELLED') return '❌ Sorteo Cancelado';
    if (isComplete) return '🎉 ¡Meta Alcanzada!';
    if (displayPercent > 90) return '🔥 ¡Casi Completo!';
    if (displayPercent > 50) return '📈 Más de la Mitad';
    return '🎯 En Progreso';
  };

  const getRemainingAmount = () => {
    return Math.max(0, target - current);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl">
      {/* Título y Notificación */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-white">{title}</h3>
        {justCompleted && showNotifications && (
          <div className="animate-bounce bg-green-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
            🎉 ¡Sorteo Completado!
          </div>
        )}
      </div>

      {/* Estado del Sorteo */}
      <div className="text-center mb-6">
        <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
          raffleStatus === 'FINISHED' ? 'bg-purple-500/20 text-purple-300' :
          raffleStatus === 'CANCELLED' ? 'bg-red-500/20 text-red-300' :
          isComplete ? 'bg-green-500/20 text-green-300' :
          'bg-blue-500/20 text-blue-300'
        }`}>
          {getStatusMessage()}
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-center">
        <div className="bg-white/5 rounded-2xl p-3 backdrop-blur-sm">
          <div className="text-2xl font-bold text-white">{formatCurrency(current)}</div>
          <div className="text-sm text-white/70">Recaudado</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 backdrop-blur-sm">
          <div className="text-2xl font-bold text-white">{displayPercent.toFixed(1)}%</div>
          <div className="text-sm text-white/70">Progreso</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 backdrop-blur-sm">
          <div className="text-2xl font-bold text-white">{formatCurrency(target)}</div>
          <div className="text-sm text-white/70">Objetivo</div>
        </div>
      </div>

      {/* Barra de Progreso Principal */}
      <div className="relative mb-4">
        <div className="h-8 bg-white/10 rounded-full overflow-hidden shadow-inner">
          <div 
            className={`h-full bg-gradient-to-r ${getProgressColor()} relative transition-all duration-1000 ease-out shadow-lg`}
            style={{ width: `${animated ? displayPercent : actualPercent}%` }}
          >
            {/* Efecto de brillo animado */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
            
            {/* Ondas de energía cuando está cerca del 100% */}
            {displayPercent > 90 && raffleStatus === 'ACTIVE' && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-ping" />
              </div>
            )}
          </div>
          
          {/* Indicador de porcentaje flotante */}
          {displayPercent > 5 && (
            <div 
              className="absolute top-0 h-full flex items-center transition-all duration-1000 ease-out"
              style={{ left: `${Math.max(displayPercent - 5, 0)}%` }}
            >
              <div className="bg-white text-gray-800 px-2 py-1 rounded-full text-xs font-bold shadow-lg transform -translate-y-10">
                {displayPercent.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Estados Visuales */}
      <div className="flex justify-between text-sm text-white/70 mb-4">
        <span>🎯 Inicio</span>
        <span className={displayPercent >= 50 ? 'text-yellow-400 font-semibold' : ''}>
          🔥 50% Medio Camino
        </span>
        <span className={isComplete ? 'text-green-400 font-semibold animate-pulse' : ''}>
          🏆 ¡Meta Alcanzada!
        </span>
      </div>

      {/* Información Adicional */}
      <div className="bg-white/5 rounded-2xl p-4 backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {!isComplete && (
            <div className="flex items-center justify-between">
              <span className="text-white/70">Falta recaudar:</span>
              <span className="text-white font-semibold">
                {formatCurrency(getRemainingAmount())}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-white/70">Estado:</span>
            <span className={`font-semibold ${
              raffleStatus === 'ACTIVE' ? 'text-green-400' :
              raffleStatus === 'PUBLISHED' ? 'text-blue-400' :
              raffleStatus === 'FINISHED' ? 'text-purple-400' :
              'text-gray-400'
            }`}>
              {raffleStatus === 'ACTIVE' ? 'Activo' :
               raffleStatus === 'PUBLISHED' ? 'Publicado' :
               raffleStatus === 'FINISHED' ? 'Finalizado' :
               raffleStatus === 'CANCELLED' ? 'Cancelado' :
               raffleStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      {raffleStatus === 'ACTIVE' && !isComplete && (
        <div className="mt-6 text-center">
          <button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200">
            🎟️ Participar Ahora
          </button>
        </div>
      )}

      {/* Mensaje de Completado */}
      {isComplete && raffleStatus === 'ACTIVE' && (
        <div className="mt-6 text-center">
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl p-4 border border-green-500/30">
            <p className="text-green-300 font-semibold mb-2">
              🎉 ¡Meta alcanzada! El sorteo se realizará pronto
            </p>
            <p className="text-white/70 text-sm">
              Todos los participantes serán notificados del resultado
            </p>
          </div>
        </div>
      )}

      {/* Efecto de partículas cuando se completa */}
      {isComplete && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${1 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;