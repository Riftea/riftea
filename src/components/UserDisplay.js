// components/UserDisplay.js
import Image from "next/image";

export default function UserDisplay({ user, showImage = true, showRole = false, size = "md" }) {
  const displayName = user?.displayName || user?.name || "Usuario";
  const userImage = user?.image || "/avatar-default.png";
  
  const sizeClasses = {
    sm: "w-6 h-6 text-sm",
    md: "w-8 h-8 text-base", 
    lg: "w-12 h-12 text-lg",
    xl: "w-16 h-16 text-xl"
  };

  const getRoleDisplay = (role) => {
    switch (role) {
      case 'ADMIN':
        return { text: 'Admin', icon: '👑', color: 'text-purple-400' };
      case 'SUPERADMIN':
        return { text: 'Super Admin', icon: '⚡', color: 'text-red-400' };
      default:
        return { text: 'Usuario', icon: '👤', color: 'text-blue-400' };
    }
  };

  return (
    <div className="flex items-center gap-2">
      {showImage && (
        <Image
          src={userImage}
          alt={displayName}
          width={size === 'sm' ? 24 : size === 'md' ? 32 : size === 'lg' ? 48 : 64}
          height={size === 'sm' ? 24 : size === 'md' ? 32 : size === 'lg' ? 48 : 64}
          className={`${sizeClasses[size].split(' ').slice(0, 2).join(' ')} rounded-full object-cover border border-white/20`}
        />
      )}
      <div className="flex flex-col">
        <span className={`font-medium text-white ${sizeClasses[size].split(' ')[2]}`}>
          {displayName}
        </span>
        {showRole && (
          <span className={`text-xs ${getRoleDisplay(user?.role).color} flex items-center gap-1`}>
            <span>{getRoleDisplay(user?.role).icon}</span>
            {getRoleDisplay(user?.role).text}
          </span>
        )}
      </div>
    </div>
  );
}

// Componente específico para mostrar en tickets/participaciones
export function ParticipantDisplay({ user, ticketNumber, purchaseDate }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <div className="flex items-center justify-between">
        <UserDisplay user={user} size="md" />
        <div className="text-right">
          <div className="text-white font-bold">#{ticketNumber}</div>
          <div className="text-white/60 text-sm">
            {new Date(purchaseDate).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook para usar el nombre de display
export function useDisplayName(user) {
  return user?.displayName || user?.name || "Usuario";
}