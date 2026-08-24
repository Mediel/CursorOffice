# Lokální komunikační protokol

## Transport

C# host a TypeScript extension komunikují lokálně přes standardní vstup a výstup. Každý řádek je samostatný JSON dokument (NDJSON). Síťový port není potřeba.

Cursor hook shim a C# host používají lokální per-user broadcast spool `%LOCALAPPDATA%/CursorOffice/events-v3`. Hook zapisuje nový soubor přes dočasný název a atomický move. Každý host vede vlastní in-memory kurzor, takže přečtení soubor nemaže; kterýkoli host smí uklidit až události po desetiminutové retenci. Verze adresáře odděluje nový broadcast od starších hostů s destruktivním single-consumer chováním. Do tohoto mezikroku nevstupuje raw hook payload.

## Obálka zprávy

```json
{
  "protocolVersion": 1,
  "type": "agent.changed",
  "occurredAt": "2026-08-21T10:00:00+00:00",
  "payload": {}
}
```

Povinná pole:

- `protocolVersion` – celé číslo určující verzi kontraktu,
- `type` – stabilní název zprávy,
- `occurredAt` – čas vzniku ve formátu ISO 8601,
- `payload` – datová část zprávy.

## Stav agenta

Povolené hodnoty v protokolu:

- `unknown`
- `idle`
- `working`
- `waitingForUser`
- `error`
- `completed`
- `offline`

`agent.changed.payload` navíc nese obecnou hierarchii lokálního Cursoru:

- `kind` – `primary` pro hlavní konverzaci nebo `subagent` pro dočasného pracovníka,
- `parentAgentId` – ID hlavní konverzace, která podagenta spustila,
- `workspace` – název lokálního workspace/repozitáře,
- `model` – model oznámený Cursor Hookem, pokud je dostupný,
- `isParallelWorker` – zda Cursor instanci označil jako paralelního pracovníka,
- `generationId` – stabilní korelace jedné modelové generace,
- `usage` – volitelné přesné `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` a dopočtené `totalTokens`.
- `windowId` / `windowLabel` – volitelná lokální identita Cursor okna a její čitelný popisek,
- `windowCorrelation` – `focused`, `conversation` nebo `workspace` podle způsobu korelace; chybí-li jednoznačný důkaz, okno zůstane nezařazené.
- `conversationTitle` – volitelný název hlavního Cursor chatu, dohledaný read-only podle `conversation_id`; zprávy se nedotazují.

ID hlavní konverzace i podagenta je stabilní napříč aktualizacemi. Nový tool event proto aktualizuje existující postavu a nevytváří nový spawn.

## Počáteční zprávy

- `host.ready` – host dokončil inicializaci,
- `agent.changed` – vznikl nebo se změnil agent,
- `agent.removed` – lifecycle projekce agenta skončil a UI jej má nechat odejít; payload obsahuje `id`,
- `usage.changed` – perzistentní lokální agregace `total`, `byWorkspace`, `byModel`, `byWorkspaceModel` a `byDay`,
- `agents.snapshot` – úplný aktuální stav, plánováno,
- `host.error` – strukturovaná chyba, plánováno.

## Kompatibilita

Přidání volitelného pole je zpětně kompatibilní. Přejmenování, odstranění nebo změna významu existujícího pole vyžaduje zvýšení `protocolVersion`.
