/**
 * modules/router_api.js
 * Gère le calcul d'itinéraires et d'isochrones via OpenRouteService.
 * Ajout : Génération d'isochrones (2, 5, 10, 13 km) autour des sites employeurs.
 */

export const RouterAPI = {
    processedRoutes: [],
    processedIsochrones: [],
    apiKey: '',
    
    init() {
        console.log("[RouterAPI] Initialisation...");
        this.apiKey = localStorage.getItem('ors_api_key') || '';
        this.ensureApiKeyUI();
    },

    ensureApiKeyUI() {
        const section = document.getElementById('step-route');
        if (!section) return;

        if (!document.getElementById('ors-api-key-input')) {
            const html = `
                <div class="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label class="block text-sm font-bold text-slate-700 mb-2 underline tracking-tight">Configuration API OpenRouteService</label>
                    <input type="password" id="ors-api-key-input" 
                           class="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                           placeholder="Collez votre clé API ici..." 
                           value="${this.apiKey}">
                    <p class="text-[10px] text-slate-400 mt-2 italic text-right">Clé stockée localement.</p>
                </div>
            `;
            const logArea = document.getElementById('route-logs');
            if (logArea) logArea.insertAdjacentHTML('beforebegin', html);

            const input = document.getElementById('ors-api-key-input');
            input.addEventListener('input', (e) => {
                this.apiKey = e.target.value.trim();
                localStorage.setItem('ors_api_key', this.apiKey);
            });
        }
    },

    /**
     * Point d'entrée principal
     */
    async startRouting(data) {
        console.log("[RouterAPI] Début du traitement complet...");
        
        if (!this.apiKey) {
            this.showStatus("❌ Erreur : Veuillez saisir une clé API valide.", "error");
            return;
        }

        this.processedRoutes = [];
        this.processedIsochrones = []; // Reset des isochrones
        
        const logArea = document.getElementById('route-logs');
        if (logArea) logArea.innerHTML = "> Initialisation du calcul (Itinéraires + Isochrones)...";

        // 1. Calcul des itinéraires (Logic existante)
        const totalRoutes = data.length;
        this.ensureProgressUI();

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            this.updateProgress(i, totalRoutes, `Itinéraire ${i + 1}/${totalRoutes}`);

            try {
                const route = await this.calculateRouteWithRadius(
                    item.start_lat, item.start_lon,
                    item.end_lat, item.end_lon,
                    300
                );
                
                this.processedRoutes.push({
                    ...item,
                    distance_km: route.distance,
                    duration_min: route.duration,
                    geometry: route.geometry,
                    status: 'success'
                });

                if (logArea) logArea.innerHTML += `<br><span class="text-emerald-400">✅ Route ${item.id} : ${route.distance} km</span>`;

            } catch (error) {
                console.error(`[RouterAPI] Erreur Route ${item.id}:`, error);
                this.processedRoutes.push({ ...item, status: 'error', error: error.message });
            }

            if (i < data.length - 1) await this.delay(1700);
        }

        // 2. Génération des Isochrones pour les sites employeurs uniques
        await this.processIsochronesForEmployers(data);

        // Fin du traitement
        this.updateProgress(100, 100, "Calculs terminés. Affichage de la carte...");
        await this.delay(1000);
        this.emitNextStep();
    },

    /**
     * Identifie les lieux uniques et génère les isochrones
     */
    async processIsochronesForEmployers(data) {
        const logArea = document.getElementById('route-logs');
        if (logArea) logArea.innerHTML += `<br><span class="text-blue-300">ℹ️ Analyse des sites employeurs pour isochrones...</span>`;

        // Extraction des destinations uniques (basé sur lat/lon pour éviter doublons de noms)
        const uniqueDestinations = {};
        data.forEach(d => {
            const key = `${d.end_lat},${d.end_lon}`;
            if (!uniqueDestinations[key]) {
                uniqueDestinations[key] = { lat: d.end_lat, lon: d.end_lon, address: d.employer_address };
            }
        });

        const destinations = Object.values(uniqueDestinations);
        const ranges = [2, 5, 10, 13]; // Distances en km
        const profile = 'cycling-regular';

        for (const dest of destinations) {
            console.log(`[RouterAPI] Isochrones pour le site : ${dest.address}`);
            
            for (const km of ranges) {
                try {
                    const isoGeoJson = await this.generateIsochrone(dest.lat, dest.lon, km, profile);
                    
                    if (isoGeoJson) {
                        // On ajoute des métadonnées pour le style
                        isoGeoJson.properties = { ...isoGeoJson.properties, range_km: km, center: dest.address };
                        this.processedIsochrones.push(isoGeoJson);
                        if (logArea) logArea.innerHTML += `<br><span class="text-indigo-400">🌐 Isochrone ${km}km généré pour ${dest.address}</span>`;
                    }
                } catch (err) {
                    console.error(`[RouterAPI] Erreur Isochrone ${km}km:`, err);
                }
                
                // Pause pour rate limiting (1 sec)
                await this.delay(1000);
            }
        }
    },

    /**
     * Appel API pour un isochrone unique
     */
    async generateIsochrone(lat, lng, distanceKm, profile) {
        try {
            const response = await fetch('https://api.openrouteservice.org/v2/isochrones/' + profile, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, application/geo+json; charset=utf-8',
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify({
                    locations: [[lng, lat]], // ORS attend [Lon, Lat]
                    range: [distanceKm * 1000], // Conversion km -> mètres
                    range_type: 'distance',
                    smoothing: 0.9,
                    attributes: ["area"]
                })
            });

            if (!response.ok) {
                console.warn(`[RouterAPI] Isochrone API Error ${response.status}`);
                return null;
            }

            const data = await response.json();
            // L'API retourne une FeatureCollection, on prend la première Feature (le polygone)
            if (data.features && data.features.length > 0) {
                return data.features[0]; 
            }
            return null;

        } catch (error) {
            console.error("[RouterAPI] Network Error on Isochrone:", error);
            return null;
        }
    },

    // ... (calculateRouteWithRadius reste inchangé) ...
    async calculateRouteWithRadius(slat, slon, elat, elon, radius) {
        const url = `https://api.openrouteservice.org/v2/directions/cycling-regular`;
        const body = {
            coordinates: [[slon, slat], [elon, elat]],
            radiuses: [radius, radius],
            format: "json",
            instructions: false,
            geometry: true,
            elevation: false
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const route = data.routes[0];
        return {
            distance: (route.summary.distance / 1000).toFixed(2),
            duration: Math.round(route.summary.duration / 60),
            geometry: route.geometry
        };
    },

    emitNextStep() {
        window.dispatchEvent(new CustomEvent('nextStep', {
            detail: {
                data: { 
                    routes: this.processedRoutes,
                    isochrones: this.processedIsochrones // Ajout des données d'isochrones
                },
                next: 'step-map'
            }
        }));
    },

    // ... (Helpers UI : ensureProgressUI, updateProgress, showStatus, delay restent inchangés) ...
    ensureProgressUI() {
        const logArea = document.getElementById('route-logs');
        if (!document.getElementById('router-progress-bar')) {
            const html = `
                <div id="router-ui" class="mb-4">
                    <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div id="router-progress-bar" class="bg-indigo-400 h-full w-0 transition-all duration-300"></div>
                    </div>
                    <p id="router-progress-text" class="text-[10px] text-slate-400 mt-2 uppercase text-center"></p>
                </div>
            `;
            if (logArea) logArea.insertAdjacentHTML('beforebegin', html);
        }
    },

    updateProgress(current, total, text) {
        const bar = document.getElementById('router-progress-bar');
        const label = document.getElementById('router-progress-text');
        const percent = total > 0 ? (current / total) * 100 : 0;
        if (bar) bar.style.width = `${percent}%`;
        if (label) label.innerText = text;
    },

    showStatus(msg, type) {
        const logArea = document.getElementById('route-logs');
        if (logArea) logArea.innerHTML += `<br><span class="${type === 'error' ? 'text-red-500' : 'text-indigo-400'} font-bold">${msg}</span>`;
    },

    delay(ms) { return new Promise(res => setTimeout(res, ms)); }
};
