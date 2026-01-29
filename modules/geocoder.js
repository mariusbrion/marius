/**
 * modules/geocoder.js
 * Géocodage avec priorité BAN, gestion des délais et groupement par employeur.
 * Mise à jour : Suivi précis des deux étapes de géocodage par ligne.
 */
export const Geocoder = {
    processedData: [],
    apiStats: { ban: { s: 0, f: 0 }, nom: { s: 0, f: 0 } },

    init() {
        const btnNext = document.getElementById('btn-go-route');
        if (btnNext) {
            btnNext.style.display = 'none';
            btnNext.addEventListener('click', () => this.emitNextStep());
        }
    },

    async startGeocoding(data) {
        console.log("[Geocoder] Lancement du traitement...");
        this.processedData = [];
        const container = document.getElementById('step-geo');
        this.ensureProgressUI(container);

        const employerGroups = {};
        let currentLetter = 'a';
        const totalRows = data.length;
        const totalSteps = totalRows * 2; // 2 géocodages par ligne

        for (let i = 0; i < data.length; i++) {
            const pair = data[i];
            const currentStepBase = i * 2;

            // --- ÉTAPE 1 : Géocodage Employé ---
            const addrEmployee = pair['adresse employé'];
            this.updateUI(currentStepBase, totalSteps, `Employé ${i + 1}/${totalRows} : ${addrEmployee}`);
            
            await this.delay(1200);
            const employeeCoords = await this.fetchWithFallback(addrEmployee);
            
            if (!employeeCoords) {
                console.warn(`[Geocoder] Échec employé : ${addrEmployee}`);
                continue; 
            }

            // --- ÉTAPE 2 : Géocodage Employeur (avec cache/groupes) ---
            let employerCoords;
            let groupId;
            const site = pair['adresse employeur'];

            this.updateUI(currentStepBase + 1, totalSteps, `Employeur ${i + 1}/${totalRows} : ${site}`);

            if (employerGroups[site]) {
                // Utilisation du cache pour optimiser les appels API
                employerCoords = employerGroups[site].coords;
                groupId = employerGroups[site].groupId;
                // Petit délai visuel pour que l'utilisateur voit l'étape passer
                await this.delay(300);
            } else {
                await this.delay(1200);
                employerCoords = await this.fetchWithFallback(site);
                
                if (!employerCoords) {
                    console.warn(`[Geocoder] Échec employeur : ${site}`);
                    continue;
                }

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
                employee_address: addrEmployee,
                employer_address: site
            });
        }

        this.updateUI(totalSteps, totalSteps, `Géocodage terminé ! ${this.processedData.length} trajets prêts.`);
        
        const btnNext = document.getElementById('btn-go-route');
        if (btnNext) btnNext.style.display = 'block';
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
                <div class="mb-6">
                    <div class="bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div id="geo-progress-bar" class="bg-indigo-500 h-full w-0 transition-all duration-300"></div>
                    </div>
                    <p id="geo-progress-text" class="text-[11px] font-medium text-slate-500 text-center mt-2 italic tracking-tight"></p>
                </div>`;
            const target = container.querySelector('div');
            if (target) target.insertAdjacentHTML('afterbegin', html);
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
