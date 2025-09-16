# Types (domain models de Riftea)

Este paquete define **tipos compartidos** para la app (API, UI y servicios).
El archivo principal es `src/types/index.d.ts` y exporta:

- Enums: `Role`, `RaffleStatus`, `TicketStatus`, `NotificationType`
- Shapes de respuestas:  
  `PublicRafflesResponse`, `RafflesListResponse`,  
  `DrawStatusResponse`, `DrawRunResponse`,  
  `ProgressResponse`
- Shapes utilitarias: `RaffleCard`, `RaffleWithStats`, `DrawParticipant`, etc.

> ✔️ No genera JS: es solo definición de tipos. Podés usarlo en **TS** o en **JS** con **JSDoc**.

---

## Importar en TypeScript

```ts
import type {
  RaffleStatus,
  PublicRafflesResponse,
  ProgressResponse,
} from "@/types";

async function fetchPublic(): Promise<PublicRafflesResponse> {
  const res = await fetch("/api/raffles/public");
  return res.json();
}

function isReadyToDraw(s: RaffleStatus) {
  return s === "READY_TO_DRAW";
}

