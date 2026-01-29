/**
 * modules/map_display.js
 * Gère le rendu cartographique via Deck.gl.
 * Affiche une Heatmap dynamique et conserve les tracés en mémoire (invisibles).
 */

export const MapDisplay = {
    deckgl: null,

    /**
     * Initialisation du rendu cartographique
     * @param {Object} state - L'état global de l'application (appState)
     */
    render(state) {
        console.log("[MapDisplay] Préparation du rendu final...");

        // 1. VÉRIFICATION DES DONNÉES
        // On vérifie la présence des points (coordonnées) et des itinéraires (routes)
        if (!state.coordinates || state.coordinates.length === 0) {
            console.error("[MapDisplay] Erreur : Données de points manquantes. Rendu annulé.");
            return;
        }

        if (!state.routes || state.routes.length === 0) {
            console.warn("[MapDisplay] Attention : Aucune ligne d'itinéraire détectée dans l'état.");
        }

        // 2. PRÉPARATION DES DONNÉES POUR LA HEATMAP
        // On extrait les points de départ et d'arrivée pour créer une densité visuelle
        const heatmapData = state.coordinates.map(d => ({
            coords: [d.start_lon, d.start_lat],
            weight: 1 // On peut ajuster le poids ici si nécessaire
        }));

        // 3. CONFIGURATION DES COUCHES DECK.GL
        const layers = [
            // --- COUCHE 1 : FOND DE CARTE (OpenStreetMap) ---
            new deck.TileLayer({
                id: 'base-map-tiles',
                data: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                minZoom: 0,
                maxZoom: 19,
                tileSize: 256,
                renderSubLayers: props => {
                    const { bbox: { west, south, east, north } } = props.tile;
                    return new deck.BitmapLayer(props, {
                        data: null,
                        image: props.data,
                        bounds: [west, south, east, north]
                    });
                }
            }),

            // --- COUCHE 2 : HEATMAP (Visible & Dynamique) ---
            new deck.HeatmapLayer({
                id: 'heatmap-layer',
                data: heatmapData,
                getPosition: d => d.coords,
                getWeight: d => d.weight,
                radiusPixels: 40,      // Rayon du flou
                intensity: 1,         // Intensité des couleurs
                threshold: 0.03,      // Seuil de visibilité pour les zones faibles
                aggregation: 'SUM',
                debounceTimeout: 100  // Fluidité lors du zoom
            }),

            // --- COUCHE 3 : ITINÉRAIRES (Invisible / Mémoire) ---
            // On utilise GeoJsonLayer pour stocker les géométries en arrière-plan
            new deck.GeoJsonLayer({
                id: 'routes-layer-internal',
                data: this.prepareGeoJson(state.routes),
                visible: false,       // Consigne : Invisible à l'écran
                opacity: 0,           // Sécurité supplémentaire
                pickable: true        // Permet d'être interrogé par le moteur de collision
            })
        ];

        // 4. INITIALISATION OU MISE À JOUR DE L'INSTANCE DECK.GL
        if (!this.deckgl) {
            this.deckgl = new deck.DeckGL({
                container: 'map-container',
                initialViewState: this.calculateInitialView(state.coordinates),
                controller: true,
                layers: layers
            });
        } else {
            this.deckgl.setProps({ layers: layers });
        }

        console.log("[MapDisplay] Carte générée avec succès.");
    },

    /**
     * Transforme les données du routeur en format GeoJSON standard
     */
    prepareGeoJson(routes) {
        if (!routes) return { type: "FeatureCollection", features: [] };
        
        return {
            type: "FeatureCollection",
            features: routes.map(r => ({
                type: "Feature",
                properties: { id: r.id, distance: r.distance_km },
                geometry: {
                    type: "LineString",
                    // Note: On suppose ici que les coordonnées sont déjà décodées
                    // Si elles sont en Polyline encodée, il faudrait les décoder ici.
                    coordinates: r.geometry.coordinates || [] 
                }
            }))
        };
    },

    /**
     * Calcule le point central pour centrer la carte au démarrage
     */
    calculateInitialView(points) {
        if (!points || points.length === 0) {
            return { longitude: 2.3522, latitude: 48.8566, zoom: 11 }; // Paris par défaut
        }

        // Moyenne simple des coordonnées pour le centrage
        const avgLon = points.reduce((sum, p) => sum + p.start_lon, 0) / points.length;
        const avgLat = points.reduce((sum, p) => sum + p.start_lat, 0) / points.length;

        return {
            longitude: avgLon,
            latitude: avgLat,
            zoom: 12,
            pitch: 0,
            bearing: 0
        };
    }
};
