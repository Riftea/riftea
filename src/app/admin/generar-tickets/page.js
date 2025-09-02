// src/app/admin/generar-tickets/page.js - COMPLETO CORREGIDO
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function GenerarTicketsPage() {
  const { data: session, status } = useSession();
  const [usuarios, setUsuarios] = useState([]);
  const [sorteos, setSorteos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    userId: '',
    sorteoId: '',
    cantidad: 1,
    crearPurchase: true,
    ticketPrice: 0
  });
  const [resultado, setResultado] = useState(null);

  // Verificar permisos
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'SUPERADMIN') {
      window.location.href = '/';
    }
  }, [session, status]);

  // Cargar usuarios
  useEffect(() => {
    const cargarUsuarios = async () => {
      try {
        const response = await fetch('/api/admin/usuarios');
        const data = await response.json();
        
        if (data.success) {
          setUsuarios(data.users);
        } else {
          console.error('Error cargando usuarios:', data.error);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };

    if (status === 'authenticated' && session?.user?.role === 'SUPERADMIN') {
      cargarUsuarios();
    }
  }, [session, status]);

  // Cargar sorteos activos
  useEffect(() => {
    const cargarSorteos = async () => {
      try {
        const response = await fetch('/api/raffles?status=ACTIVE,PUBLISHED');
        const data = await response.json();
        
        if (data.success) {
          setSorteos(data.raffles || []);
        }
      } catch (error) {
        console.error('Error cargando sorteos:', error);
      }
    };

    if (status === 'authenticated' && session?.user?.role === 'SUPERADMIN') {
      cargarSorteos();
    }
  }, [session, status]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResultado(null);

    try {
      const response = await fetch('/api/admin/generar-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setResultado({
          success: true,
          mensaje: data.mensaje,
          tickets: data.tickets,
          resumen: data.resumen
        });
        
        // Resetear formulario
        setFormData({
          userId: '',
          sorteoId: '',
          cantidad: 1,
          crearPurchase: true,
          ticketPrice: 0
        });
      } else {
        setResultado({
          success: false,
          error: data.error
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setResultado({
        success: false,
        error: 'Error de conexión'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Si no está autenticado o no es SUPERADMIN, mostrar loading o redirigir
  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">
      <div className="text-lg">Cargando...</div>
    </div>;
  }

  if (!session || session.user.role !== 'SUPERADMIN') {
    return <div className="flex justify-center items-center min-h-screen">
      <div className="text-lg text-red-600">No autorizado</div>
    </div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Generar Tickets - Panel Admin</h1>

      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6">
          {/* Usuario */}
          <div className="mb-4">
            <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Usuario *
            </label>
            <select
              id="userId"
              name="userId"
              value={formData.userId}
              onChange={handleInputChange}
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Seleccionar Usuario --</option>
              {usuarios.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          {/* Sorteo (Opcional) */}
          <div className="mb-4">
            <label htmlFor="sorteoId" className="block text-sm font-medium text-gray-700 mb-2">
              Sorteo (Opcional)
            </label>
            <select
              id="sorteoId"
              name="sorteoId"
              value={formData.sorteoId}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Tickets Genéricos --</option>
              {sorteos.map(sorteo => (
                <option key={sorteo.id} value={sorteo.id}>
                  {sorteo.title} - ${sorteo.ticketPrice}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Si seleccionas un sorteo, se crearán automáticamente las participaciones
            </p>
          </div>

          {/* Cantidad */}
          <div className="mb-4">
            <label htmlFor="cantidad" className="block text-sm font-medium text-gray-700 mb-2">
              Cantidad de Tickets
            </label>
            <input
              type="number"
              id="cantidad"
              name="cantidad"
              value={formData.cantidad}
              onChange={handleInputChange}
              min="1"
              max="100"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Precio por ticket (solo si no hay sorteo) */}
          {!formData.sorteoId && (
            <div className="mb-4">
              <label htmlFor="ticketPrice" className="block text-sm font-medium text-gray-700 mb-2">
                Precio por Ticket (ARS)
              </label>
              <input
                type="number"
                id="ticketPrice"
                name="ticketPrice"
                value={formData.ticketPrice}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Crear Purchase */}
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="crearPurchase"
                checked={formData.crearPurchase}
                onChange={handleInputChange}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Crear registro de Purchase ficticia</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Recomendado para mantener consistencia en el historial
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Generando...' : 'Generar Tickets'}
          </button>
        </form>

        {/* Resultado */}
        {resultado && (
          <div className={`mt-6 p-4 rounded-lg ${resultado.success ? 'bg-green-100 border-green-500' : 'bg-red-100 border-red-500'} border`}>
            {resultado.success ? (
              <div>
                <h3 className="text-lg font-semibold text-green-800 mb-2">¡Éxito!</h3>
                <p className="text-green-700 mb-4">{resultado.mensaje}</p>
                
                {resultado.resumen && (
                  <div className="bg-white p-3 rounded border">
                    <h4 className="font-medium mb-2">Resumen:</h4>
                    <ul className="text-sm space-y-1">
                      <li><strong>Tipo:</strong> {resultado.resumen.tipo}</li>
                      <li><strong>Cantidad:</strong> {resultado.resumen.cantidad} tickets</li>
                      <li><strong>Precio Total:</strong> ${resultado.resumen.precioTotal}</li>
                      <li><strong>Con Purchase:</strong> {resultado.resumen.conPurchase ? 'Sí' : 'No'}</li>
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
                <p className="text-red-700">{resultado.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}