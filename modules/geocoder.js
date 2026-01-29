/**
 * modules/geocoder.js
 * Gère la conversion des adresses textuelles en coordonnées GPS (Lat/Lon).
 * Utilise Nominatim avec un fallback vers l'API Adresse (BAN).
 */

export const Geocoder = {
    processedData: [],
    apiStats: {
        nominatim: { success: 0, failed: 0 },
        ban: { success: 0, failed: 0 },
        totalFailed: 0
    },

    /**
     * Initialisation du module
     */
    init() {
        console.log("[Geocoder] Module prêt.");
        const btnNext = document.getElementById('btn-go-route');
        if (btnNext) {
            // Le bouton est initialement caché ou désactivé jusqu'à la fin du traitement
            btnNext.style.display = 'none';
            btnNext.addEventListener('click', () => this.emitNextStep());
        }
    },

    /**
     * Point d'entrée lancé par l'orchestrateur
     * @param {Array} data - Tableau d'objets { "adresse employé", "adresse employeur" }
     */
    async startGeocoding(data) {
        console.log("[Geocoder] Début du traitement...");
        this.processedData = [];
        this.resetStats();
        
        const container = document.getElementById('step-geo');
        const statusText = container.querySelector('p.font-semibold');
        const btnNext = document.getElementById('btn-go-route');

        const employerGroups = {};
        let currentLetter = 'a';
        const totalItems = data.length;

        // Création dynamique d'une barre de progression locale si absente
        this.ensureProgressElements(container);

        for (let i = 0; i < data.length; i++) {
            const pair = data[i];
            const addrEmployee = pair['adresse employé'];
            const addrEmployer = pair['adresse employeur'];

            // 1. Géocodage Employé
            this.updateProgressUI(i, totalItems, `Géocodage employé : ${addrEmployee}`);
            await this.delay(1200); // Respect des APIs
            const employeeCoords = await this.fetchWithFallback(addrEmployee);

            if (!employeeCoords) {
                this.apiStats.totalFailed++;
                continue;
            }

            // 2. Géocodage Employeur (avec cache pour les groupes)
            let employerCoords;
            let groupId;

            if (employerGroups[addrEmployer]) {
                employerCoords = employerGroups[addrEmployer].coords;
                groupId = employerGroups[addrEmployer].groupId;
            } else {
                this.updateProgressUI(i, totalItems, `Géocodage employeur : ${addrEmployer}`);
                await this.delay(1200);
                employerCoords = await this.fetchWithFallback(addrEmployer);

                if (!employerCoords) {
                    this.apiStats.totalFailed++;
                    continue;
                }

                groupId = currentLetter;
                employerGroups[addrEmployer] = { coords: employerCoords, groupId: currentLetter, count: 0 };
                currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
            }

            employerGroups[addrEmployer].count++;
            const id = `employé ${groupId}${employerGroups[addrEmployer].count}`;

            this.processedData.push({
                id: id,
                start_lat: employeeCoords.lat,
                start_lon: employeeCoords.lon,
                end_lat: employerCoords.lat,
                end_lon: employerCoords.lon,
                employee_address: addrEmployee,
                employer_address: addrEmployer
            });
        }

        // Fin du traitement
        statusText.innerText = "Géocodage terminé !";
        statusText.className = "font-semibold text-emerald-600";
        if (btnNext) btnNext.style.display = 'block';
        
        this.updateProgressUI(totalItems, totalItems, `Terminé : ${this.processedData.length} paires converties.`);
    },

    /**
     * Logique de Fetch avec Fallback Nominatim -> BAN
     */
    async fetchWithFallback(address) {
        // Essai Nominatim
        let result = await this.callNominatim(address);
        if (result) {
            this.apiStats.nominatim.success++;
            return result;
        }

        // Fallback BAN
        this.apiStats.nominatim.failed++;
        await this.delay(500);
        result = await this.callBAN(address);
        
        if (result) {
            this.apiStats.ban.success++;
            return result;
        }

        this.apiStats.ban.failed++;
        return null;
    },

    async callNominatim(address) {
        try {
            const query = encodeURIComponent(address.replace(';', ', ') + ", France");
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=fr`);
            const data = await response.json();
            return data.length > 0 ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
        } catch (e) { return null; }
    },

    async callBAN(address) {
        try {
            const query = encodeURIComponent(address.replace(';', ' '));
            const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${query}&limit=1`);
            const data = await response.json();
            if (data.features?.length > 0) {
                const coords = data.features[0].geometry.coordinates;
                return { lat: coords[1], lon: coords[0] };
            }
            return null;
        } catch (e) { return null; }
    },

    emitNextStep() {
        window.dispatchEvent(new CustomEvent('nextStep', {
            detail: {
                data: { coordinates: this.processedData },
                next: 'step-route'
            }
        }));
    },

    /**
     * Helpers UI
     */
    ensureProgressElements(container) {
        if (!document.getElementById('geo-progress-bar')) {
            const html = `
                <div class="mt-4 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div id="geo-progress-bar" class="bg-indigo-500 h-full w-0 transition-all duration-300"></div>
                </div>
                <p id="geo-progress-text" class="text-xs text-slate-500 mt-2 italic text-center">Initialisation...</p>
            `;
            container.querySelector('.space-y-4').insertAdjacentHTML('afterbegin', html);
        }
    },

    updateProgressUI(current, total, text) {
        const bar = document.getElementById('geo-progress-bar');
        const label = document.getElementById('geo-progress-text');
        const percent = (current / total) * 100;
        if (bar) bar.style.width = `${percent}%`;
        if (label) label.innerText = text;
    },

    delay(ms) { return new Promise(res => setTimeout(res, ms)); },
    
    resetStats() {
        this.apiStats = { nominatim: { success: 0, failed: 0 }, ban: { success: 0, failed: 0 }, totalFailed: 0 };
    }
};
