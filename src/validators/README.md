# Validators (con Zod)

Colección de esquemas de validación para endpoints de Riftea. Están pensados para:
- Normalizar y validar **query params** (`searchParams`)
- Validar **bodies** de `POST/PUT`
- Proveer **tipos** consistentes a la UI y a los servicios

> Requiere `zod`:
>
> ```bash
> npm i zod
> ```

## Estructura

- `common.js`: utilidades genéricas (`safeParseOrThrow`, enums, paginación, flags booleanos).
- `raffles.js`: schemas para crear/actualizar/listar rifas, draw y progress.
- `tickets.js`: schemas para emisión/uso/verificación de tickets.
- `purchases.js` (opcional): schemas para compras.
- `index.js`: barrel para importar desde `@/validators`.

## Uso Rápido

### 1) Validar **query params** (GET)

```js
import { safeParseOrThrow } from "@/validators/common";
import { PublicListQuerySchema } from "@/validators";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const params = Object.fromEntries(searchParams.entries());

  // Lanza 400 si algo no cumple el schema
  const q = safeParseOrThrow(PublicListQuerySchema, params);

  // q = { q, sortBy, order, page, perPage }
  // ...
}
