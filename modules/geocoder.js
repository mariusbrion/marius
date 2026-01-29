/**
 * modules/geocoder.js
 * Gère la conversion des adresses textuelles en coordonnées GPS.
 */

export const Geocoder = {
    processedData: [],
    apiStats: {
        nominatim: { success: 0, failed: 0 },
        ban: { success: 0, failed: 0 },
        totalFailed: 0
    },

    init() {
        console.log("[Geocoder] Module prêt.");
        const btnNext = document.getElementById('btn-go-route');
        if (btnNext) {
            btnNext.style.display = 'none';
            btnNext.addEventListener('click', () => this.emitNextStep());
        }
    },

    async startGeocoding(data) {
        console.log("[Geocoder] Début du traitement...");
        this.processedData = [];
        this.resetStats();
        
        const container = document.getElementById('step-geo');
        if (!container) return;

        const statusText = container.querySelector('p.font-semibold') || { innerText: "" };
        const btnNext = document.getElementById('btn-go-route');

        const employerGroups = {};
        let currentLetter = 'a';
        const totalItems = data.length;

        // On s'assure que les éléments visuels sont là
        this.ensureProgressElements(container);

        for (let i = 0; i < data.length; i++) {
            const pair = data[i];
            const addrEmployee = pair['adresse employé'];
            const addrEmployer = pair['adresse employeur'];

            // Mise à jour UI
            this.updateProgressUI(i, totalItems, `Traitement ${i+1}/${totalItems} : ${addrEmployee}`);

            // 1. Géocodage Employé
            await this.delay(1200); 
            const employeeCoords = await this.fetchWithFallback(addrEmployee);

            if (!employeeCoords) {
                this.apiStats.totalFailed++;
                continue;
            }

            // 2. Géocodage Employeur
            let employerCoords;
            let groupId;

            if (employerGroups[addrEmployer]) {
                employerCoords = employerGroups[addrEmployer].coords;
                groupId = employerGroups[addrEmployer].groupId;
            } else {
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

        // Fin
        statusText.innerText = "Géocodage terminé !";
        if (statusText.classList) {
            statusText.classList.remove('text-indigo-900');
            statusText.classList.add('text-emerald-600');
        }
        
        if (btnNext) btnNext.style.display = 'block';
        this.updateProgressUI(totalItems, totalItems, `Terminé : ${this.processedData.length} paires converties.`);
    },

    async fetchWithFallback(address) {
        let result = await this.callNominatim(address);
        if (result) {
            this.apiStats.nominatim.success++;
            return result;
        }

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
     * Correction ici : On cible le premier DIV interne de la section
     */
    ensureProgressElements(container) {
        if (!document.getElementById('geo-progress-bar')) {
            const target = container.querySelector('div'); // Cible le conteneur blanc avec padding
            if (!target) return;

            const html = `
                <div id="geo-ui-container" class="mt-4 mb-6">
                    <div class="bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div id="geo-progress-bar" class="bg-indigo-500 h-full w-0 transition-all duration-300"></div>
                    </div>
                    <p id="geo-progress-text" class="text-xs text-slate-500 mt-2 italic text-center">Initialisation du moteur de géocodage...</p>
                </div>
            `;
            // Insérer après le titre ou au début du conteneur
            target.insertAdjacentHTML('afterbegin', html);
        }
    },

    updateProgressUI(current, total, text) {
        const bar = document.getElementById('geo-progress-bar');
        const label = document.getElementById('geo-progress-text');
        const percent = total > 0 ? (current / total) * 100 : 0;
        if (bar) bar.style.width = `${percent}%`;
        if (label) label.innerText = text;
    },

    delay(ms) { return new Promise(res => setTimeout(res, ms)); },
    
    resetStats() {
        this.apiStats = { nominatim: { success: 0, failed: 0 }, ban: { success: 0, failed: 0 }, totalFailed: 0 };
    }
};
