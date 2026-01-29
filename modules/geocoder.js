/**
 * modules/geocoder.js
 * Gère la conversion des adresses textuelles en coordonnées GPS.
 * Priorité : BAN (Base Adresse Nationale) -> Nominatim (Fallback).
 * Inclut une logique de retry pour gérer les erreurs 504 et 429.
 */

export const Geocoder = {
    processedData: [],
    apiStats: {
        ban: { success: 0, failed: 0 },
        nominatim: { success: 0, failed: 0 },
        totalFailed: 0
    },

    init() {
        console.log("[Geocoder] Module prêt. Priorité : BAN.");
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

        this.ensureProgressElements(container);

        for (let i = 0; i < data.length; i++) {
            const pair = data[i];
            const addrEmployee = pair['adresse employé'];
            const addrEmployer = pair['adresse employeur'];

            this.updateProgressUI(i, totalItems, `Traitement ${i+1}/${totalItems} : ${addrEmployee}`);

            // 1. Géocodage Employé (BAN d'abord)
            await this.delay(800); 
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
                await this.delay(800);
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
                employer_address: addrEmployer,
                source: employeeCoords.source
            });
        }

        statusText.innerText = "Géocodage terminé !";
        if (statusText.classList) {
            statusText.classList.remove('text-indigo-900');
            statusText.classList.add('text-emerald-600');
        }
        
        if (btnNext) btnNext.style.display = 'block';
        this.updateProgressUI(totalItems, totalItems, `Terminé : ${this.processedData.length} paires converties.`);
    },

    /**
     * Tente la BAN en premier, puis Nominatim en cas d'échec.
     */
    async fetchWithFallback(address) {
        // PRIORITÉ 1 : BAN avec retries
        let result = await this.fetchWithRetry(() => this.callBAN(address), 2);
        
        if (result) {
            this.apiStats.ban.success++;
            return { ...result, source: 'BAN' };
        }

        this.apiStats.ban.failed++;
        console.warn(`[Geocoder] Échec BAN pour : ${address}. Tentative Nominatim...`);
        
        // Délai avant de basculer sur Nominatim
        await this.delay(1000);
        
        // PRIORITÉ 2 (Fallback) : Nominatim avec retries
        result = await this.fetchWithRetry(() => this.callNominatim(address), 2);
        
        if (result) {
            this.apiStats.nominatim.success++;
            return { ...result, source: 'Nominatim' };
        }

        this.apiStats.nominatim.failed++;
        return null;
    },

    async fetchWithRetry(apiCall, maxRetries = 2) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await apiCall();
                if (result) return result;
                if (result === null) return null; 
            } catch (error) {
                console.warn(`[Geocoder] Erreur réseau (tentative ${i+1}), nouvel essai...`);
                await this.delay(1500 * (i + 1));
            }
        }
        return null;
    },

    /**
     * Appel à l'API Adresse (BAN)
     */
    async callBAN(address) {
        const query = encodeURIComponent(address.replace(';', ' '));
        const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${query}&limit=1`);

        if (response.status === 504 || response.status === 429) {
            throw new Error(`BAN Server Error ${response.status}`);
        }

        if (!response.ok) return null;

        const data = await response.json();
        if (data.features?.length > 0) {
            const coords = data.features[0].geometry.coordinates;
            return { lat: coords[1], lon: coords[0] };
        }
        return null;
    },

    /**
     * Appel à Nominatim (OSM)
     */
    async callNominatim(address) {
        const query = encodeURIComponent(address.replace(';', ', ') + ", France");
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=fr`, {
            headers: { 'Accept-Language': 'fr' }
        });

        if (response.status === 504 || response.status === 429) {
            throw new Error(`Nominatim Server Error ${response.status}`);
        }

        if (!response.ok) return null;
        
        const data = await response.json();
        return data.length > 0 ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
    },

    emitNextStep() {
        window.dispatchEvent(new CustomEvent('nextStep', {
            detail: {
                data: { coordinates: this.processedData },
                next: 'step-route'
            }
        }));
    },

    ensureProgressElements(container) {
        if (!document.getElementById('geo-progress-bar')) {
            const target = container.querySelector('div'); 
            if (!target) return;

            const html = `
                <div id="geo-ui-container" class="mt-4 mb-6">
                    <div class="bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div id="geo-progress-bar" class="bg-indigo-500 h-full w-0 transition-all duration-300"></div>
                    </div>
                    <p id="geo-progress-text" class="text-xs text-slate-500 mt-2 italic text-center">Moteur : BAN (prioritaire) & Nominatim...</p>
                </div>
            `;
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
        this.apiStats = { ban: { success: 0, failed: 0 }, nominatim: { success: 0, failed: 0 }, totalFailed: 0 };
    }
};
