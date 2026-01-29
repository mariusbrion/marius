/**
 * modules/geocoder.js
 * Géocodage avec priorité BAN, gestion des délais et groupement par employeur.
 */
export const Geocoder = {
    processedData: [],
    apiStats: { ban: { s: 0, f: 0 }, nom: { s: 0, f: 0 } },

    init() {
        const btnNext = document.getElementById('btn-go-route');
        if (btnNext) btnNext.addEventListener('click', () => this.emitNextStep());
    },

    async startGeocoding(data) {
        console.log("[Geocoder] Lancement du traitement...");
        this.processedData = [];
        const container = document.getElementById('step-geo');
        this.ensureProgressUI(container);

        const employerGroups = {};
        let currentLetter = 'a';
        const total = data.length;

        for (let i = 0; i < data.length; i++) {
            const pair = data[i];
            this.updateUI(i, total, `Traitement : ${pair['adresse employé']}`);

            // 1. Géocodage Employé
            await this.delay(1200);
            const employeeCoords = await this.fetchWithFallback(pair['adresse employé']);
            if (!employeeCoords) continue;

            // 2. Géocodage Employeur (avec cache/groupes)
            let employerCoords;
            let groupId;
            const site = pair['adresse employeur'];

            if (employerGroups[site]) {
                employerCoords = employerGroups[site].coords;
                groupId = employerGroups[site].groupId;
            } else {
                await this.delay(1200);
                employerCoords = await this.fetchWithFallback(site);
                if (!employerCoords) continue;

                groupId = currentLetter;
                employerGroups[site] = { coords: employerCoords, groupId: currentLetter, count: 0 };
                currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
            }

            employerGroups[site].count++;
            const id = `employé ${groupId}${employerGroups[site].count}`;

            this.processedData.push({
                id,
                start_lat: employeeCoords.lat,
                start_lon: employeeCoords.lon,
                end_lat: employerCoords.lat,
                end_lon: employerCoords.lon,
                employee_address: pair['adresse employé'],
                employer_address: site
            });
        }

        this.updateUI(total, total, "Géocodage terminé !");
        document.getElementById('btn-go-route').style.display = 'block';
    },

    async fetchWithFallback(address) {
        // Tente BAN d'abord
        let res = await this.callBAN(address);
        if (res) { this.apiStats.ban.s++; return res; }
        
        // Fallback Nominatim
        await this.delay(500);
        res = await this.callNominatim(address);
        if (res) { this.apiStats.nom.s++; return res; }
        
        return null;
    },

    async callBAN(addr) {
        try {
            const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(addr)}&limit=1`;
            const r = await fetch(url);
            const d = await r.json();
            if (d.features?.length > 0) {
                const c = d.features[0].geometry.coordinates;
                return { lat: c[1], lon: c[0] };
            }
        } catch(e) { return null; }
    },

    async callNominatim(addr) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr + ', France')}&limit=1`;
            const r = await fetch(url);
            const d = await r.json();
            if (d.length > 0) return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) };
        } catch(e) { return null; }
    },

    emitNextStep() {
        window.dispatchEvent(new CustomEvent('nextStep', {
            detail: { data: { coordinates: this.processedData }, next: 'step-route' }
        }));
    },

    ensureProgressUI(container) {
        if (!document.getElementById('geo-progress-bar')) {
            const html = `
                <div class="mb-6"><div class="bg-slate-100 rounded-full h-2 overflow-hidden">
                <div id="geo-progress-bar" class="bg-indigo-500 h-full w-0 transition-all"></div>
                </div><p id="geo-progress-text" class="text-xs text-center mt-2"></p></div>`;
            container.querySelector('div').insertAdjacentHTML('afterbegin', html);
        }
    },

    updateUI(curr, tot, txt) {
        const bar = document.getElementById('geo-progress-bar');
        const lbl = document.getElementById('geo-progress-text');
        if (bar) bar.style.width = `${(curr / tot) * 100}%`;
        if (lbl) lbl.innerText = txt;
    },

    delay(ms) { return new Promise(r => setTimeout(r, ms)); }
};
