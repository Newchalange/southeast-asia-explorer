# Southeast Asia Explorer

Interaktiv reseguide för Thailand, Kambodja och Vietnam. Baseras på version 10.3.

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
