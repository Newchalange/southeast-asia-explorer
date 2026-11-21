# Kartassistent 15.0

## Ansvar

- `chat-engine.js`: ren, deterministisk sökning, normalisering, katalogadapter
  och `createLocalProvider().search(query, context)`. Ingen DOM, lagring eller nättrafik.
- `chat-ui.js`: läser befintliga favoriter/dolda ID:n vid varje sökning, visar text
  med `textContent`, bygger ett separat Leaflet-lager och kopplar resultat till
  appens befintliga detalj- och hotellvyer. Endast kända katalog-ID:n får visas.
- `chat-ai.js`: valfri serverprovider med samma gränssnitt. Bygger en minimal
  begäran, validerar svaret och faller tillbaka på den lokala providern.
- `ai-worker/worker.mjs`: Cloudflare Worker som anropar Workers AI via bindning.
- `chat.css`: avgränsad chattlayout, tangentbordsfokus och mobilstorlekar.

Resultatkontraktet är `{items: [{id, ...}], intent, total, message}`. ID:n har
prefix `place:` eller `hotel:`. Gränssnittet slår alltid upp objekten i sin lokala
katalog; providerdata får inte bestämma koordinater, HTML, länkar eller kod.
`intent` bär regioner, kategorier, typer, favoritvillkor, sökord och antal för
uttryckliga följdfrågor. `Rensa chatten` avbryter logiskt väntande svar genom
ett generationsnummer. Chatten behåller högst tolv meddelanden i DOM.

Version 15 inför en enda ny localStorage-nyckel, `sea15_chat_ai` (`1`/`0`), för
AI-valet. Befintliga nycklar är oförändrade.
Ordinarie rendering kompletteras med uppdatering av chattlagret, så att ett dolt
objekt eller en borttagen favorit inte ligger kvar i ett aktivt favoritresultat.

## Serverprovider (version 15)

Lokal sökning är standard. AI-läget visas bara när `DEFAULT_ENDPOINT` i `chat-ai.js`
är en https-adress, och används först när användaren kryssat i det. Vid timeout
(35 s), kvot slut, hastighetsgräns, serverfel eller ogiltigt svar används den lokala
sökningen och orsaken visas i chatten.

1. Webbläsaren skickar `POST /api/travel-chat` med `{v:1, query, previous, catalog}`:
   frågan (högst 500 tecken), föregående fråga, föregående träff-ID:n och filter samt
   den synliga publika katalogen som korta ID:n (`p<id>`, `h<index>`). Inga cookies.
2. Ingen API-nyckel finns. Workern når modellen via Workers AI-bindningen `AI` på
   Cloudflares gratisplan, som stoppar anrop när dygnskvoten är slut i stället för
   att debitera.
3. Workern kräver origin ur `ALLOWED_ORIGINS`, JSON, högst 96 kB, högst 400 objekt,
   och har hastighetsgränser per IP (6/min) och totalt (20/min per plats). CORS är
   inte autentisering; kvoten är det yttersta kostnadsskyddet. Inget loggas.
4. Modellen får fri text plus `ids` (högst 8) eller ett `filter` (regioner,
   kategorier, typer, favoritesOnly). Workern validerar schema, längd och ID:n mot
   den skickade katalogen och regionnamn mot katalogens namn. Högst två modellanrop.
5. Klienten validerar igen, slår upp ID:n i sin lokala katalog, tillämpar dolda
   objekt och favoriter lokalt och visar texten med `textContent`.
6. Hint-texten i AI-läge säger vad som lämnar enheten. Resplan, favoriter, lagring
   och äldre chatt skickas inte. Dolda objekt utelämnas ur katalogen.

Livepris, rumstillgänglighet, avgångar och faciliteter kräver separata verifierade
källor med datum/tid och angivna villkor. En AI-modell eller katalogens schabloner
är inte en sådan källa. Systemprompten förbjuder sådana påståenden och klienten lägger
alltid till en fast varning när frågan gäller pris, ledighet eller faciliteter.
