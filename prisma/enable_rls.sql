-- ==========================================
-- RIFTEA - Activación de RLS y políticas (Corregido para Prisma)
-- ==========================================

-- 1. Activar Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- 2. Políticas

-- --- Tabla users ---
DROP POLICY IF EXISTS "Ver mi usuario" ON public.users;
CREATE POLICY "Ver mi usuario"
ON public.users
FOR SELECT
USING (auth.uid()::text = id);

DROP POLICY IF EXISTS "Actualizar mi usuario" ON public.users;
CREATE POLICY "Actualizar mi usuario"
ON public.users
FOR UPDATE
USING (auth.uid()::text = id);

-- --- Tabla purchases ---
DROP POLICY IF EXISTS "Ver mis compras" ON public.purchases;
CREATE POLICY "Ver mis compras"
ON public.purchases
FOR SELECT
USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Insertar mis compras" ON public.purchases;
CREATE POLICY "Insertar mis compras"
ON public.purchases
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- --- Tabla tickets ---
DROP POLICY IF EXISTS "Ver mis tickets" ON public.tickets;
CREATE POLICY "Ver mis tickets"
ON public.tickets
FOR SELECT
USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Insertar mis tickets" ON public.tickets;
CREATE POLICY "Insertar mis tickets"
ON public.tickets
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- --- Tabla participations ---
-- Las participaciones se ven a través del ticket que posee el usuario
DROP POLICY IF EXISTS "Ver mis participaciones" ON public.participations;
CREATE POLICY "Ver mis participaciones"
ON public.participations
FOR SELECT
USING (
  ticket_id IN (
    SELECT id FROM public.tickets WHERE user_id = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Insertar mis participaciones" ON public.participations;
CREATE POLICY "Insertar mis participaciones"
ON public.participations
FOR INSERT
WITH CHECK (
  ticket_id IN (
    SELECT id FROM public.tickets WHERE user_id = auth.uid()::text
  )
);

-- --- Tabla raffles ---
-- Los usuarios pueden ver todas las rifas activas
DROP POLICY IF EXISTS "Ver rifas activas" ON public.raffles;
CREATE POLICY "Ver rifas activas"
ON public.raffles
FOR SELECT
USING (true); -- Todas las rifas son públicas

-- Solo el dueño puede actualizar su rifa
DROP POLICY IF EXISTS "Actualizar mis rifas" ON public.raffles;
CREATE POLICY "Actualizar mis rifas"
ON public.raffles
FOR UPDATE
USING (auth.uid()::text = owner_id);

-- Solo usuarios autenticados pueden crear rifas
DROP POLICY IF EXISTS "Crear rifas" ON public.raffles;
CREATE POLICY "Crear rifas"
ON public.raffles
FOR INSERT
WITH CHECK (auth.uid()::text = owner_id);