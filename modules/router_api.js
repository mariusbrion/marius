/**
 * modules/router_api.js
 * Gère le calcul d'itinéraires via l'API OpenRouteService.
 * Inclut la gestion de la clé API, le décodage de polylignes et le cadencement des requêtes.
 */

export const RouterAPI = {
    processedRoutes: [],
    apiKey: '',
    
    /**
     * Initialisation du module
     */
    init() {
        console.log("[RouterAPI] Initialisation...");
        
        // 1. Gestion de la clé API
        this.apiKey = localStorage.getItem('ors_api_key') || '';
        this.ensureApiKeyUI();

        // 2. Configuration du bouton de navigation (Étape suivante)
        const btnNext = document.getElementById('btn-go-settings');
        if (btnNext) {
            btnNext.style.display = 'none'; // Caché jusqu'à la fin du calcul
            btnNext.addEventListener('click', () => this.emitNextStep());
        }
    },

    /**
     * Prépare l'interface pour la clé API dans la section #step-route
     */
    ensureApiKeyUI() {
        const section = document.getElementById('step-route');
        if (!section) return;

        // Création du champ si absent
        if (!document.getElementById('ors-api-key-input')) {
            const html = `
                <div class="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <label class="block text-sm font-bold text-indigo-900 mb-2">Clé API OpenRouteService :</label>
                    <input type="password" id="ors-api-key-input" 
                           class="w-full p-2 rounded border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                           placeholder="Saisissez votre clé API..." 
                           value="${this.apiKey}">
                    <p class="text-[10px] text-indigo-400 mt-2 italic">La clé est sauvegardée localement dans votre navigateur.</p>
                </div>
            `;
            // Insertion au début de la section
            section.querySelector('div')?.insertAdjacentHTML('afterbegin', html);

            // Listener pour sauvegarde automatique
            const input = document.getElementById('ors-api-key-input');
            input.addEventListener('input', (e) => {
                this.apiKey = e.target.value.trim();
                localStorage.setItem('ors_api_key', this.apiKey);
            });
        }
    },

    /**
     * Lance le calcul des itinéraires par lot
     * @param {Array} coordinates - Données venant du géocodage
     */
    async startRouting(data) {
        console.log("[RouterAPI] Début du calcul des itinéraires...");
        
        if (!this.apiKey) {
            this.showStatus("❌ Erreur : Veuillez saisir une clé API OpenRouteService.", "error");
            return;
        }

        this.processedRoutes = [];
        const total = data.length;
        const logArea = document.getElementById('route-logs');
        const btnNext = document.getElementById('btn-go-settings');

        // Préparation de l'UI de progression
        this.ensureProgressUI();

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            this.updateProgress(i, total, `Calcul trajet ${i + 1}/${total} : ${item.id}`);

            try {
                // Appel API
                const route = await this.fetchRoute(item.start_lat, item.start_lon, item.end_lat, item.end_lon);
                
                this.processedRoutes.push({
                    ...item,
                    distance_km: route.distance,
                    duration_min: route.duration,
                    geometry: route.geometry,
                    status: 'success'
                });

                if (logArea) logArea.innerHTML += `<br><span class="text-emerald-400">✅ ${item.id} : ${route.distance}km</span>`;

            } catch (error) {
                console.error(`[RouterAPI] Erreur sur ${item.id}:`, error);
                if (logArea) logArea.innerHTML += `<br><span class="text-red-400">❌ ${item.id} : ${error.message}</span>`;
                
                this.processedRoutes.push({
                    ...item,
                    status: 'error',
                    error: error.message
                });
            }

            // Respect du rate limiting (1.6s entre les requêtes pour le plan gratuit)
            if (i < data.length - 1) await this.delay(1650);
        }

        this.updateProgress(total, total, "Calculs terminés.");
        if (btnNext) btnNext.style.display = 'block';
    },

    /**
     * Appel à l'API Directions de OpenRouteService
     */
    async fetchRoute(slat, slon, elat, elon) {
        const url = `https://api.openrouteservice.org/v2/directions/cycling-regular`;
        const body = {
            coordinates: [[slon, slat], [elon, elat]],
            format: "json",
            instructions: false,
            geometry: true
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `Erreur HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.routes || data.routes.length === 0) throw new Error("Aucun trajet trouvé.");

        const route = data.routes[0];
        return {
            distance: (route.summary.distance / 1000).toFixed(2),
            duration: Math.round(route.summary.duration / 60),
            geometry: route.geometry // Polyline encodée
        };
    },

    /**
     * Envoie vers l'étape suivante
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
     * Helpers UI
     */
    ensureProgressUI() {
        const logArea = document.getElementById('route-logs');
        if (!document.getElementById('router-progress-bar')) {
            const html = `
                <div id="router-ui" class="mb-4">
                    <div class="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div id="router-progress-bar" class="bg-indigo-400 h-full w-0 transition-all duration-300"></div>
                    </div>
                    <p id="router-progress-text" class="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter">Initialisation...</p>
                </div>
            `;
            logArea?.insertAdjacentHTML('beforebegin', html);
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
