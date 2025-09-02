import { useState, useEffect } from 'react';

export default function AdminTicketGenerator({ session }) {
  // Recibe session como prop en lugar de usar useSession
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Cargar usuarios al montar el componente
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // ✅ Endpoint corregido - usa 'usuarios' en lugar de 'users'
      const response = await fetch('/api/admin/usuarios');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const generateTicket = async () => {
    if (!selectedUserId) {
      setMessage('Por favor selecciona un usuario');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // ✅ Endpoint corregido - usa 'generar-tickets' en lugar de 'tickets/generate'
      const response = await fetch('/api/admin/generar-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUserId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`Ticket generado exitosamente para ${data.ticket.user.name || data.ticket.user.email}`);
        setMessageType('success');
        setSelectedUserId('');
      } else {
        setMessage(data.error || 'Error al generar ticket');
        setMessageType('error');
      }
    } catch (error) {
      setMessage('Error de conexión');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  // Solo mostrar si es superadmin
  if (!session || session.user.role !== 'SUPERADMIN') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-600">Solo superadmins pueden acceder a esta función</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Generar Ticket Manualmente
        </h2>
        <p className="text-gray-600">
          Como superadmin, puedes generar tickets manualmente para cualquier usuario.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label htmlFor="user-select" className="block text-sm font-medium text-gray-700 mb-2">
            Seleccionar Usuario
          </label>
          <select
            id="user-select"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          >
            <option value="">-- Selecciona un usuario --</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email}) - {user.role}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={generateTicket}
          disabled={loading || !selectedUserId}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            loading || !selectedUserId
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          }`}
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Generando Ticket...
            </div>
          ) : (
            'Generar Ticket'
          )}
        </button>
      </div>

      {message && (
        <div className={`mt-6 p-4 rounded-md ${
          messageType === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <div className="flex items-center">
            <div className={`w-5 h-5 mr-3 ${
              messageType === 'success' ? 'text-green-500' : 'text-red-500'
            }`}>
              {messageType === 'success' ? (
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <p>{message}</p>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 rounded-md">
        <h3 className="font-medium text-gray-900 mb-2">ℹ️ Información del Sistema</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Cada ticket genera un UUID único automáticamente</li>
          <li>• Se crea un hash SHA256 basado en userId + ticketUuid</li>
          <li>• El usuario recibe una notificación automática</li>
          <li>• Los tickets inician con estado "AVAILABLE"</li>
        </ul>
      </div>
    </div>
  );
}