/**
 * modules/router_api.js
 * Gère le calcul d'itinéraires vélo via OpenRouteService.
 * Intègre la logique de "search radius" et le décodage de polylines.
 */

export const RouterAPI = {
    processedRoutes: [],
    apiKey: '',
    
    /**
     * Initialisation du module
     */
    init() {
        console.log("[RouterAPI] Initialisation...");
        
        // Charger la clé depuis le localStorage
        this.apiKey = localStorage.getItem('ors_api_key') || '';
        this.ensureApiKeyUI();

        // Configurer le bouton vers l'étape suivante
        const btnNext = document.getElementById('btn-go-settings');
        if (btnNext) {
            btnNext.style.display = 'none';
            btnNext.addEventListener('click', () => this.emitNextStep());
        }
    },

    /**
     * Prépare l'interface pour la saisie de la clé API
     */
    ensureApiKeyUI() {
        const section = document.getElementById('step-route');
        if (!section) return;

        if (!document.getElementById('ors-api-key-input')) {
            const html = `
                <div class="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label class="block text-sm font-bold text-slate-700 mb-2 underline">Configuration API OpenRouteService</label>
                    <input type="password" id="ors-api-key-input" 
                           class="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                           placeholder="Collez votre clé API ici..." 
                           value="${this.apiKey}">
                    <p class="text-[10px] text-slate-400 mt-2 italic text-right">Clé stockée localement (localStorage)</p>
                </div>
            `;
            const container = section.querySelector('div');
            if (container) container.insertAdjacentHTML('afterbegin', html);

            const input = document.getElementById('ors-api-key-input');
            input.addEventListener('input', (e) => {
                this.apiKey = e.target.value.trim();
                localStorage.setItem('ors_api_key', this.apiKey);
            });
        }
    },

    /**
     * Lance le calcul par lot
     * @param {Array} data - Tableau issu du Geocoder
     */
    async startRouting(data) {
        console.log("[RouterAPI] Début du calcul pour", data.length, "trajets...");
        
        if (!this.apiKey) {
            this.showStatus("❌ Erreur : Veuillez saisir une clé API valide.", "error");
            return;
        }

        this.processedRoutes = [];
        const logArea = document.getElementById('route-logs');
        if (logArea) logArea.innerHTML = "> Initialisation du moteur d'itinéraires...";

        const total = data.length;
        this.ensureProgressUI();

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            this.updateProgress(i, total, `Calcul itinéraire ${i + 1}/${total} : ${item.id}`);

            try {
                // Log de débogage pour vérifier la cohérence des points
                console.log(`[RouterAPI] Envoi trajet ${item.id} : START [${item.start_lat}, ${item.start_lon}] -> END [${item.end_lat}, ${item.end_lon}]`);

                // Appel API avec le "search radius" de 300m de votre code original
                const route = await this.calculateRouteWithRadius(
                    item.start_lat, item.start_lon,
                    item.end_lat, item.end_lon,
                    300 // Radius en mètres
                );
                
                this.processedRoutes.push({
                    ...item,
                    distance_km: route.distance,
                    duration_min: route.duration,
                    geometry: route.geometry, // Polyline encodée
                    status: 'success'
                });

                if (logArea) logArea.innerHTML += `<br><span class="text-emerald-400">✅ ${item.id} : ${route.distance} km (${route.duration} min)</span>`;

            } catch (error) {
                console.error(`[RouterAPI] Erreur ${item.id}:`, error);
                if (logArea) logArea.innerHTML += `<br><span class="text-red-400">❌ ${item.id} : ${error.message}</span>`;
                
                this.processedRoutes.push({
                    ...item,
                    status: 'error',
                    error: error.message
                });
            }

            // Délai de 1.6s pour respecter le plan gratuit ORS (max 40 requêtes / min)
            if (i < data.length - 1) await this.delay(1650);
        }

        this.updateProgress(total, total, "Tous les itinéraires ont été calculés.");
        const btnNext = document.getElementById('btn-go-settings');
        if (btnNext) btnNext.style.display = 'block';
    },

    /**
     * Logique de calcul avec rayon de recherche (Radius)
     */
    async calculateRouteWithRadius(slat, slon, elat, elon, radius) {
        const url = `https://api.openrouteservice.org/v2/directions/cycling-regular`;
        
        // ATTENTION : ORS attend [Longitude, Latitude]
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
            const errorText = await response.text();
            let msg = `Erreur HTTP ${response.status}`;
            try {
                const errData = JSON.parse(errorText);
                msg = errData.error?.message || msg;
            } catch(e) {}
            throw new Error(msg);
        }

        const data = await response.json();
        if (!data.routes || data.routes.length === 0) throw new Error("Aucun itinéraire trouvé.");

        const route = data.routes[0];
        return {
            distance: (route.summary.distance / 1000).toFixed(2),
            duration: Math.round(route.summary.duration / 60),
            geometry: route.geometry
        };
    },

    /**
     * Envoie les données vers l'étape finale
     */
    emitNextStep() {
        window.dispatchEvent(new CustomEvent('nextStep', {
            detail: {
                data: { routes: this.processedRoutes },
                next: 'step-settings'
            }
        }));
    },

    /**
     * Gestion de l'UI
     */
    ensureProgressUI() {
        const logArea = document.getElementById('route-logs');
        if (!document.getElementById('router-progress-bar')) {
            const html = `
                <div id="router-ui" class="mb-4">
                    <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div id="router-progress-bar" class="bg-indigo-400 h-full w-0 transition-all duration-300"></div>
                    </div>
                    <p id="router-progress-text" class="text-[10px] text-slate-400 mt-2 uppercase tracking-widest text-center"></p>
                </div>
            `;
            if (logArea) logArea.insertAdjacentHTML('beforebegin', html);
        }
    },

    updateProgress(current, total, text) {
        const bar = document.getElementById('router-progress-bar');
        const label = document.getElementById('router-progress-text');
        const percent = (current / total) * 100;
        if (bar) bar.style.width = `${percent}%`;
        if (label) label.innerText = text;
    },

    showStatus(msg, type) {
        const logArea = document.getElementById('route-logs');
        if (logArea) logArea.innerHTML += `<br><span class="${type === 'error' ? 'text-red-500' : 'text-indigo-400'} font-bold">${msg}</span>`;
    },

    delay(ms) { return new Promise(res => setTimeout(res, ms)); }
};
