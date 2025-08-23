// src/hooks/useProgress.js
import { useState, useEffect, useRef } from 'react';

/**
 * 📊 Hook para monitorear progreso de sorteos en tiempo real
 */
export function useRaffleProgress(raffleId, options = {}) {
  const {
    refreshInterval = 5000, // 5 segundos
    enableWebSocket = false, // futuro: WebSocket updates
    autoRefresh = true
  } = options;

  const [progress, setProgress] = useState({
    current: 0,
    target: 100,
    percentage: 0,
    status: 'loading',
    participants: 0,
    timeRemaining: null,
    lastUpdated: null
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const wsRef = useRef(null);

  // 📡 Fetch progress data
  const fetchProgress = async () => {
    try {
      const response = await fetch(`/api/raffles/${raffleId}/progress`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      setProgress({
        current: data.currentFunding || 0,
        target: data.targetFunding || 100,
        percentage: data.progressPercentage || 0,
        status: data.status || 'active',
        participants: data.totalParticipants || 0,
        timeRemaining: data.timeRemaining || null,
        lastUpdated: new Date()
      });
      
      setLoading(false);
      setError(null);
      
    } catch (err) {
      console.error('❌ Error fetching progress:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // 🔄 Start/stop polling
  const startPolling = () => {
    if (intervalRef.current) return;
    
    intervalRef.current = setInterval(fetchProgress, refreshInterval);
    console.log(`📊 Polling iniciado para sorteo ${raffleId} cada ${refreshInterval}ms`);
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log(`📊 Polling detenido para sorteo ${raffleId}`);
    }
  };

  // 🚀 Initialize
  useEffect(() => {
    if (!raffleId) return;
    
    // Initial fetch
    fetchProgress();
    
    // Start polling if enabled
    if (autoRefresh) {
      startPolling();
    }
    
    return () => {
      stopPolling();
      // Close WebSocket if exists
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [raffleId, autoRefresh, refreshInterval]);

  // 📈 Calculate derived values
  const isComplete = progress.percentage >= 100;
  const isNearComplete = progress.percentage >= 90;
  const progressColor = getProgressColor(progress.percentage);
  const estimatedCompletion = getEstimatedCompletion(progress);

  return {
    ...progress,
    loading,
    error,
    isComplete,
    isNearComplete,
    progressColor,
    estimatedCompletion,
    refresh: fetchProgress,
    startPolling,
    stopPolling
  };
}

/**
 * 🎯 Hook para múltiples sorteos
 */
export function useMultipleRafflesProgress(raffleIds = [], options = {}) {
  const [rafflesProgress, setRafflesProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMultipleProgress = async () => {
    try {
      const promises = raffleIds.map(id => 
        fetch(`/api/raffles/${id}/progress`).then(r => r.json())
      );
      
      const results = await Promise.allSettled(promises);
      const progressData = {};
      
      results.forEach((result, index) => {
        const raffleId = raffleIds[index];
        
        if (result.status === 'fulfilled') {
          const data = result.value;
          progressData[raffleId] = {
            current: data.currentFunding || 0,
            target: data.targetFunding || 100,
            percentage: data.progressPercentage || 0,
            status: data.status || 'active',
            participants: data.totalParticipants || 0,
            lastUpdated: new Date()
          };
        } else {
          progressData[raffleId] = {
            error: result.reason?.message || 'Error desconocido'
          };
        }
      });
      
      setRafflesProgress(progressData);
      setLoading(false);
      setError(null);
      
    } catch (err) {
      console.error('❌ Error fetching multiple progress:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (raffleIds.length === 0) return;
    
    fetchMultipleProgress();
    
    // Auto refresh every 10 seconds for multiple raffles
    const interval = setInterval(fetchMultipleProgress, 10000);
    
    return () => clearInterval(interval);
  }, [raffleIds.join(',')]);

  return {
    rafflesProgress,
    loading,
    error,
    refresh: fetchMultipleProgress,
    getProgress: (raffleId) => rafflesProgress[raffleId] || null,
    getCompletedRaffles: () => Object.entries(rafflesProgress)
      .filter(([_, progress]) => progress.percentage >= 100)
      .map(([id]) => id),
    getTotalProgress: () => {
      const values = Object.values(rafflesProgress).filter(p => !p.error);
      if (values.length === 0) return 0;
      return values.reduce((sum, p) => sum + p.percentage, 0) / values.length;
    }
  };
}

/**
 * 🎨 Obtener color del progreso según porcentaje
 */
function getProgressColor(percentage) {
  if (percentage >= 100) return 'green';
  if (percentage >= 90) return 'amber';
  if (percentage >= 75) return 'orange';
  if (percentage >= 50) return 'blue';
  return 'cyan';
}

/**
 * ⏰ Estimar tiempo de completación basado en velocidad actual
 */
function getEstimatedCompletion(progress) {
  // Implementación simple - en producción usarías ML o análisis más sofisticado
  const { current, target, lastUpdated } = progress;
  
  if (!lastUpdated || current >= target) return null;
  
  // Asumir velocidad constante (muy simplificado)
  const remaining = target - current;
  const avgDailyGrowth = current / 7; // asumimos 1 semana promedio
  
  if (avgDailyGrowth <= 0) return null;
  
  const daysRemaining = Math.ceil(remaining / avgDailyGrowth);
  const completionDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
  
  return {
    daysRemaining,
    completionDate,
    confidence: 'low' // indicar que es una estimación muy básica
  };
}

/**
 * 🔔 Hook para notificaciones de progreso
 */
export function useProgressNotifications(raffleId, thresholds = [25, 50, 75, 90, 100]) {
  const [notifiedThresholds, setNotifiedThresholds] = useState(new Set());
  const { percentage, isComplete } = useRaffleProgress(raffleId);

  useEffect(() => {
    thresholds.forEach(threshold => {
      if (percentage >= threshold && !notifiedThresholds.has(threshold)) {
        // 🔔 Disparar notificación
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`🎯 Sorteo al ${threshold}%`, {
            body: threshold === 100 
              ? '¡Sorteo completamente financiado! Se ejecutará pronto.' 
              : `El sorteo ha alcanzado el ${threshold}% de financiamiento`,
            icon: '/logo.png',
            tag: `progress-${raffleId}-${threshold}`
          });
        }
        
        // 🎊 Efecto visual para 100%
        if (threshold === 100) {
          // Disparar confetti o animación especial
          console.log('🎉 ¡Sorteo completado! Ejecutar animación...');
        }
        
        setNotifiedThresholds(prev => new Set([...prev, threshold]));
      }
    });
  }, [percentage, thresholds, notifiedThresholds, raffleId]);

  // 🔔 Solicitar permisos de notificación
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  };

  return {
    notifiedThresholds: Array.from(notifiedThresholds),
    requestNotificationPermission,
    canNotify: 'Notification' in window && Notification.permission === 'granted',
    resetNotifications: () => setNotifiedThresholds(new Set())
  };
}

/**
 * 📊 Hook para estadísticas agregadas de usuario
 */
export function useUserProgressStats() {
  const [stats, setStats] = useState({
    totalTickets: 0,
    activeRaffles: 0,
    completedRaffles: 0,
    totalContributed: 0,
    averageProgress: 0,
    favoriteCategories: []
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/users/me/progress-stats');
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('❌ Error fetching user stats:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return {
    stats,
    loading,
    refresh: fetchStats
  };
}