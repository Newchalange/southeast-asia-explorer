# Kartassistent 14.0

## Ansvar

- `chat-engine.js`: ren, deterministisk sökning, normalisering, katalogadapter
  och `createLocalProvider().search(query, context)`. Ingen DOM, lagring eller nättrafik.
- `chat-ui.js`: läser befintliga favoriter/dolda ID:n vid varje sökning, visar text
  med `textContent`, bygger ett separat Leaflet-lager och kopplar resultat till
  appens befintliga detalj- och hotellvyer. Endast kända katalog-ID:n får visas.
- `chat.css`: avgränsad chattlayout, tangentbordsfokus och mobilstorlekar.

Resultatkontraktet är `{items: [{id, ...}], intent, total, message}`. ID:n har
prefix `place:` eller `hotel:`. Gränssnittet slår alltid upp objekten i sin lokala
katalog; providerdata får inte bestämma koordinater, HTML, länkar eller kod.
`intent` bär regioner, kategorier, typer, favoritvillkor, sökord och antal för
uttryckliga följdfrågor. `Rensa chatten` avbryter logiskt väntande svar genom
ett generationsnummer. Chatten behåller högst tolv meddelanden i DOM.

Ingen ny permanent lagring införs. Befintliga localStorage-nycklar är oförändrade.
Ordinarie rendering kompletteras med uppdatering av chattlagret, så att ett dolt
objekt eller en borttagen favorit inte ligger kvar i ett aktivt favoritresultat.

## Framtida serverprovider – inte aktiverad

En ny provider kan ersätta den lokala vid en enda konstruktionspunkt i `chat-ui.js`.
Lokal sökning ska vara standard och finnas som reserv vid timeout eller serverfel.
Serverdelen är ett separat, uttryckligt införande; version 14 har inga AI-anrop.

Föreslaget flöde:

1. Webbläsaren skickar en längdbegränsad fråga och ett validerat söktillstånd till
   en egen HTTPS-endpoint, exempelvis `/api/travel-chat` på serverhosting.
   GitHub Pages kan inte köra endpointen. En separat server kan kräva strikt CORS.
2. API-nyckeln finns endast i serverns hemlighetslager, aldrig i HTML, JavaScript,
   repo, URL, localStorage eller en publik byggvariabel.
3. Servern har autentisering eller lämpligt missbruksskydd, ursprungskontroll,
   hastighetsgränser, timeout, storleksgränser och kostnadstak. CORS ensam är inte
   autentisering. Loggar ska inte innehålla hemligheter eller onödiga personuppgifter.
4. Modellen får endast föreslå strukturerade sökvillkor/kända katalog-ID:n.
   Servern validerar schema, max antal, tillåtna kategorier och ID:n mot katalogen.
   Ingen modelltext får utlösa kod, godtyckliga URL-anrop eller ändra resplan/favoriter.
5. Klienten validerar svarsschemat innan det lämnas till befintlig rendering,
   slår upp ID:n lokalt och tillämpar aktuella dolda/favoritvillkor igen.
   Okända ID:n ignoreras. Servermeddelanden återges alltid som text.
6. Visa tydligt att frågan lämnar enheten innan serverläget aktiveras. Skicka bara
   nödvändiga data; skicka inte hela resplanen, all lagring eller chatthistoriken
   automatiskt. Favorit-ID:n kan filtreras lokalt i stället för att lämna enheten.

Livepris, rumstillgänglighet, avgångar och faciliteter kräver separata verifierade
källor med datum/tid och angivna villkor. En AI-modell eller katalogens schabloner
är inte en sådan källa. Utan källstöd ska även en framtida provider säga att uppgiften
inte är verifierad och länka till den befintliga manuella jämförelsen.
