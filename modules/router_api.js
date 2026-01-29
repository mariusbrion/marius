/**
 * modules/router_api.js
 * Gère le calcul d'itinéraires vélo via OpenRouteService.
 * Correction : Envoi automatique vers 'step-map' à la fin du traitement.
 */

export const RouterAPI = {
    processedRoutes: [],
    apiKey: '',
    
    init() {
        console.log("[RouterAPI] Initialisation...");
        this.apiKey = localStorage.getItem('ors_api_key') || '';
        this.ensureApiKeyUI();
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
                    <label class="block text-sm font-bold text-slate-700 mb-2 underline tracking-tight">Configuration API OpenRouteService</label>
                    <input type="password" id="ors-api-key-input" 
                           class="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                           placeholder="Collez votre clé API ici..." 
                           value="${this.apiKey}">
                    <p class="text-[10px] text-slate-400 mt-2 italic text-right">La clé est sauvegardée dans ce navigateur.</p>
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
     * Lance le calcul par lot
     */
    async startRouting(data) {
        console.log("[RouterAPI] Début du calcul...");
        
        if (!this.apiKey) {
            this.showStatus("❌ Erreur : Veuillez saisir une clé API valide.", "error");
            return;
        }

        this.processedRoutes = [];
        const logArea = document.getElementById('route-logs');
        if (logArea) logArea.innerHTML = "> Initialisation du calcul des itinéraires...";

        const total = data.length;
        this.ensureProgressUI();

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            this.updateProgress(i, total, `Itinéraire ${i + 1}/${total}`);

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

                if (logArea) {
                    logArea.innerHTML += `<br><span class="text-emerald-400">✅ ${item.id} : ${route.distance} km</span>`;
                }

            } catch (error) {
                console.error(`[RouterAPI] Erreur ${item.id}:`, error);
                if (logArea) logArea.innerHTML += `<br><span class="text-red-400">❌ ${item.id} : ${error.message}</span>`;
                
                this.processedRoutes.push({
                    ...item,
                    status: 'error',
                    error: error.message
                });
            }

            // Rate limiting (1.7s entre requêtes)
            if (i < data.length - 1) await this.delay(1700);
        }

        this.updateProgress(total, total, "Tous les itinéraires calculés. Affichage de la carte...");
        
        // --- AUTOMATISATION FINALE ---
        // On attend une seconde pour que l'utilisateur lise le statut final avant de basculer
        await this.delay(1000);
        this.emitNextStep();
    },

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
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.routes || data.routes.length === 0) throw new Error("Aucun trajet trouvé.");

        const route = data.routes[0];
        return {
            distance: (route.summary.distance / 1000).toFixed(2),
            duration: Math.round(route.summary.duration / 60),
            geometry: route.geometry
        };
    },

    /**
     * Envoie vers step-map sans attendre de clic
     */
    emitNextStep() {
        window.dispatchEvent(new CustomEvent('nextStep', {
            detail: {
                data: { routes: this.processedRoutes },
                next: 'step-map'
            }
        }));
    },

    ensureProgressUI() {
        const logArea = document.getElementById('route-logs');
        if (!document.getElementById('router-progress-bar')) {
            const html = `
                <div id="router-ui" class="mb-4">
                    <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div id="router-progress-bar" class="bg-indigo-400 h-full w-0 transition-all duration-300"></div>
                    </div>
                    <p id="router-progress-text" class="text-[10px] text-slate-400 mt-2 uppercase tracking-widest text-center italic"></p>
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
