# Southeast Asia Explorer

Interaktiv reseguide för Thailand, Kambodja och Vietnam. Version 15.0.

## Gratis AI-assistent i version 15

Kartassistenten kan nu svara med en riktig AI-modell. Kryssa i **Använd riktig AI
(gratis)** i chatten. Valet sparas på enheten (`sea15_chat_ai`). Utan kryss fungerar
allt som i version 14.

- AI:n svarar fritt på svenska (upplägg, resvägar, säsong, mat) och föreslår platser
  och hotell ur appens katalog, som visas som gula nålar och resultatkort.
- Den körs på **Cloudflare Workers AI** via en egen liten worker i `ai-worker/`.
  Ingen API-nyckel behövs. Gratisplanen ger 10 000 neuroner per dygn, ungefär
  50 frågor med standardmodellen Llama 3.3 70B. När kvoten är slut, vid fel eller
  efter 35 sekunder visas den lokala sökningen i stället. Gratisplanen debiterar inget.
- Endast frågan, föregående fråga/träffar och den publika katalogen skickas.
  Favoriter, resplan och övrig lagring lämnar inte enheten. Dolda objekt utelämnas ur
  katalogen och favoritfrågor filtreras lokalt. Svaret visas alltid som text och bara kända katalog-ID:n visas.
- AI kan ta fel. Pris, lediga rum, tider och faciliteter är aldrig verifierade.

### Driftsätta AI-workern

Kräver Node.js och ett gratis Cloudflare-konto. Kör i mappen `ai-worker`:

```sh
npx --yes wrangler login
npx --yes wrangler deploy
node test-live.mjs https://reseguide-ai.<ditt-namn>.workers.dev
```

Lägg sedan in adressen `https://reseguide-ai.<ditt-namn>.workers.dev/api/travel-chat`
i `DEFAULT_ENDPOINT` överst i `chat-ai.js` (nu `https://reseguide-ai.andersmarieresa.workers.dev/api/travel-chat`).
Är `DEFAULT_ENDPOINT` tom visas inget AI-val.
Tillåtna webbplatser styrs av `ALLOWED_ORIGINS` i `ai-worker/wrangler.toml`
(standard `https://newchalange.github.io`). Där kan även `MODEL` bytas, t.ex. till
`@cf/google/gemma-4-26b-a4b-it` som räcker till fler frågor per dygn.

## Lokal kartassistent (sedan version 14)

Öppna **Kartassistent · gratis** under reseintroduktionen. Den söker lokalt bland
247 platser och 44 hotellkandidater, utan AI-modell, konto, API eller API-avgift.

- `Stränder i östra Thailand` kombinerar kategori och region.
- `Hotell på Koh Chang` söker hotellkandidater.
- `Mina favoriter i Vietnam` använder sparade platser och hotell.
- `Natur och stränder i norra Vietnam` väljer flera kategorier i en region.
- `och bara favoriter` begränsar föregående sökning. En vanlig ny fråga börjar om.
- Namn går också att söka, t.ex. `ibis Bangkok Riverside`.

Gula numrerade nålar visar resultaten i ett separat Leaflet-lager, med automatisk
zoom. Hotell på samma områdespunkt grupperas i en nål med en lista i popupen.
Kartans vanliga filter, resplan och sparade val ändras inte av sökningen.
Dolda objekt utesluts. Favoritknapparna använder appens befintliga lagring.
Rensa chatten tar bort samtal och chattnålar, men inte sparade favoriter.

Sökningen är regelbaserad och förstår inte alla formuleringar. Närhet betyder
textmatchning mot katalogen, inte en beräknad radie. Antalsval tar katalogens
första träffar, inte en kvalitetsranking. Pris, tillgänglighet, AC och badrum
kan inte verifieras eller användas som säkra filter. Hotellnålar är områdespunkter.
Chatten hålls endast i minnet och skickas inte till någon server. Befintliga
kart- och bildtjänster kräver fortfarande internet.

## Utveckling och tester

Webbappen är statisk och kräver inget byggsteg. Behåll `chat-engine.js`,
`chat-ai.js`, `chat-ui.js` och `chat.css` intill `index.html` vid publicering.
Mappen `ai-worker/` driftsätts separat och påverkar inte GitHub Pages.

```sh
npm ci
npm test
npm run test:browser
```

Söktesterna använder den verkliga katalogen och kontrollerar även JavaScript-syntax.
AI-testerna kör workern och klientens AI-läge mot en simulerad modell: origin, storlek,
hastighetsgränser, kvot, okända ID:n, favoriter lokalt och reserv till lokal sökning.
Webbläsartesterna använder lokalt installerad Microsoft Edge i dolt läge och
internet för Leaflet. De testar 1280, 390 och 320 pixlars bredd, kartzoom,
hotellgruppering, favoriter, dolda objekt, flikar, flyglager, bevarad resplan,
textinjektion och sökning när kartbiblioteket inte är tillgängligt.
Webbläsartestet täcker även AI-läget mot en simulerad endpoint. Utan Edge eller
CDN-åtkomst: `PW_CHANNEL=chrome` och `UNPKG_DIR=<mapp med leaflet@1.9.4/...>`.
Skärmbilder skrivs till ignorerade `test-results/`.

Arkitekturen för chatten och AI-workern finns i [CHAT-ARCHITECTURE.md](CHAT-ARCHITECTURE.md).

## Publicera med GitHub Pages
1. Skapa ett **nytt offentligt repository** (t.ex. `southeast-asia-explorer`) på GitHub. Använd inte repot för tradingboten.
2. Ladda upp **alla filer i den här mappen direkt i repositoryts rot** (index.html, manifest.webmanifest, icon.svg, .nojekyll).
3. Gå till **Settings → Pages → Build and deployment**, välj **Deploy from a branch**, branch `main`, folder `/ (root)` och spara.
4. Vänta på publicering och öppna länken som visas i Pages-inställningarna.

## Alternativ: Cloudflare Pages
Skapa ett nytt Pages-projekt och anslut det separata GitHub-repot. Välj ingen build command, output directory `/` eller projektets rot enligt Cloudflares aktuella gränssnitt.

## Viktigt
- Appen behöver internet för kartbilder, Leaflet och Wikipedia-bilder.
- Favoriter, dolda platser och resplan lagras i webbläsarens localStorage och synkas **inte** mellan telefoner.
- Om du tidigare använt en lokal HTML-fil följer inte dina lokala favoriter automatiskt med till den publicerade webbplatsen. Exportera din plan från gamla appen först.
- Hotellpriser och faciliteter är **inte liveverifierade**. Kontrollera alltid AC och eget badrum i den specifika rumstypen.
- Momondo-knapparna öppnar sökning, inte förbokade rum eller garanterade priser.
- För att installera på Android: öppna publicerade sidan i Chrome och välj **Lägg till på startskärmen** om alternativet finns. Full PWA-installation kan kräva ytterligare ikoner och en service worker.
