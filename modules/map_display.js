/**
 * modules/map_display.js
 * Gère le rendu cartographique via Deck.gl.
 * Correction : Décodage des polylines et décomposition des trajets pour la Heatmap.
 */

export const MapDisplay = {
    deckgl: null,

    /**
     * Initialisation du rendu cartographique
     * @param {Object} state - L'état global (appState) contenant les routes calculées
     */
    render(state) {
        console.log("[MapDisplay] Début du rendu Deck.gl...");

        if (!state.routes || state.routes.length === 0) {
            console.error("[MapDisplay] Aucune route à afficher.");
            return;
        }

        // 1. DÉCODAGE ET PRÉPARATION DES DONNÉES
        // On transforme les polylines en tableaux de points et on génère les données Heatmap
        const allTrajectoires = []; // Pour la couche GeoJson (Lignes)
        const allHeatmapPoints = []; // Pour la Heatmap (Tous les points de tous les trajets)

        state.routes.forEach(route => {
            if (route.status === 'success' && route.geometry) {
                // Décodage de la polyline ORS
                const coords = this.decodePolyline(route.geometry);
                
                // Préparation de la ligne (GeoJSON)
                allTrajectoires.push({
                    type: "Feature",
                    properties: { id: route.id, dist: route.distance_km },
                    geometry: {
                        type: "LineString",
                        coordinates: coords
                    }
                });

                // Préparation de la Heatmap (Décomposition du trajet en points)
                coords.forEach(p => {
                    allHeatmapPoints.push({ coords: p });
                });
            }
        });

        // 2. CONFIGURATION DES COUCHES
        const layers = [
            // Fond de carte OSM (CartoDB Voyager)
            new deck.TileLayer({
                id: 'base-map-tiles',
                data: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                minZoom: 0,
                maxZoom: 19,
                renderSubLayers: props => {
                    const { bbox: { west, south, east, north } } = props.tile;
                    return new deck.BitmapLayer(props, {
                        data: null,
                        image: props.data,
                        bounds: [west, south, east, north]
                    });
                }
            }),

            // HEATMAP : Affiche la densité de TOUS les points des trajets
            new deck.HeatmapLayer({
                id: 'heatmap-layer',
                data: allHeatmapPoints,
                getPosition: d => d.coords,
                getWeight: 1,
                radiusPixels: 35,
                intensity: 1,
                threshold: 0.05,
                aggregation: 'SUM'
            }),

            // COUCHE MÉMOIRE : Les itinéraires réels (invisibles)
            new deck.GeoJsonLayer({
                id: 'routes-layer-internal',
                data: { type: "FeatureCollection", features: allTrajectoires },
                visible: false,
                pickable: true
            })
        ];

        // 3. LANCEMENT DU RENDERER
        if (!this.deckgl) {
            this.deckgl = new deck.DeckGL({
                container: 'map-container',
                initialViewState: this.calculateInitialView(allHeatmapPoints),
                controller: true,
                layers: layers
            });
        } else {
            this.deckgl.setProps({ 
                layers: layers,
                initialViewState: this.calculateInitialView(allHeatmapPoints) 
            });
        }
    },

    /**
     * Décode une Polyline encodée (algorithme Google/ORS)
     */
    decodePolyline(str, precision = 5) {
        let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null,
            lat_change, lng_change, factor = Math.pow(10, precision);

        while (index < str.length) {
            byte = null; shift = 0; result = 0;
            do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lat_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
            shift = result = 0;
            do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lng_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += lat_change; lng += lng_change;
            coordinates.push([lng / factor, lat / factor]);
        }
        return coordinates;
    },

    calculateInitialView(points) {
        if (points.length === 0) return { longitude: -0.57, latitude: 44.83, zoom: 12 };
        const avgLon = points.reduce((s, p) => s + p.coords[0], 0) / points.length;
        const avgLat = points.reduce((s, p) => s + p.coords[1], 0) / points.length;
        return { longitude: avgLon, latitude: avgLat, zoom: 11, pitch: 0, bearing: 0 };
    }
};
