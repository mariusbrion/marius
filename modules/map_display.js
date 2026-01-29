/**
 * modules/map_display.js
 * Gère le rendu cartographique via Deck.gl et la sauvegarde Cloud vers Google Sheets.
 */

export const MapDisplay = {
    deckgl: null,
    lastState: null, // Stockage temporaire du state pour la sauvegarde

    /**
     * Initialisation du rendu cartographique
     * @param {Object} state - L'état global (appState)
     */
    render(state) {
        console.log("[MapDisplay] Début du rendu Deck.gl...");
        this.lastState = state;

        if (!state.routes || state.routes.length === 0) {
            console.error("[MapDisplay] Aucune route à afficher.");
            return;
        }

        // Configuration du bouton de sauvegarde (une seule fois)
        const saveBtn = document.getElementById('btn-cloud-save');
        if (saveBtn && !saveBtn.dataset.init) {
            saveBtn.addEventListener('click', () => this.saveToSheets(this.lastState));
            saveBtn.dataset.init = "true";
        }

        // 1. PRÉPARATION DES DONNÉES
        const allTrajectoires = [];
        const allHeatmapPoints = [];

        state.routes.forEach(route => {
            if (route.status === 'success' && route.geometry) {
                const coords = this.decodePolyline(route.geometry);
                
                allTrajectoires.push({
                    type: "Feature",
                    properties: { id: route.id, dist: route.distance_km },
                    geometry: { type: "LineString", coordinates: coords }
                });

                coords.forEach(p => {
                    allHeatmapPoints.push({ coords: p });
                });
            }
        });

        // 2. CONFIGURATION DES COUCHES
        const layers = [
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

            new deck.HeatmapLayer({
                id: 'heatmap-layer',
                data: allHeatmapPoints,
                getPosition: d => d.coords,
                radiusPixels: 35,
                intensity: 1,
                threshold: 0.05
            }),

            new deck.GeoJsonLayer({
                id: 'routes-layer-internal',
                data: { type: "FeatureCollection", features: allTrajectoires },
                visible: false,
                pickable: true
            })
        ];

        // 3. RENDER
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
     * Envoie les données consolidées vers Google Sheets
     */
    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');

        if (!siteName || !cityName) {
            alert("Veuillez renseigner le nom du site et la ville avant de sauvegarder.");
            return;
        }

        if (!state.rawData || !state.routes) {
            console.error("[MapDisplay] Données manquantes pour la sauvegarde.");
            return;
        }

        // Feedback visuel
        const originalBtnText = btn.innerHTML;
        btn.disabled = true;
        btn.innerText = "Envoi en cours...";

        try {
            // file1 : CSV original
            const file1 = state.rawData;

            // file2 : Points de départ/arrivée (GeoJSON)
            const file2 = {
                type: "FeatureCollection",
                features: state.coordinates.map(c => ([
                    {
                        type: "Feature",
                        properties: { id: c.id, type: "depart", address: c.employee_address },
                        geometry: { type: "Point", coordinates: [c.start_lon, c.start_lat] }
                    },
                    {
                        type: "Feature",
                        properties: { id: c.id, type: "arrivee", address: c.employer_address },
                        geometry: { type: "Point", coordinates: [c.end_lon, c.end_lat] }
                    }
                ])).flat()
            };

            // file3 : Lignes d'itinéraires décodées (GeoJSON)
            const file3 = {
                type: "FeatureCollection",
                features: state.routes
                    .filter(r => r.status === 'success')
                    .map(r => ({
                        type: "Feature",
                        properties: { id: r.id, distance: r.distance_km, duration: r.duration_min },
                        geometry: { type: "LineString", coordinates: this.decodePolyline(r.geometry) }
                    }))
            };

            // Payload exact demandé
            const payload = new URLSearchParams();
            payload.append('field1', siteName);
            payload.append('field2', cityName);
            payload.append('field3', JSON.stringify(file1));
            payload.append('field4', JSON.stringify(file2));
            payload.append('field5', JSON.stringify(file3));

            const url = "https://script.google.com/macros/s/AKfycbwTDUwHS5Z27PgGr3Vu73kwgUXQ4iJyXjwlB8faTVydZ4RyA8nQ_GWYzFdmify4EYLxYA/exec";

            await fetch(url, {
                method: 'POST',
                mode: 'no-cors', // Consigne
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: payload
            });

            // Avec no-cors, on ne peut pas lire la réponse, on assume le succès si pas d'erreur réseau
            alert("Données sauvegardées !");

        } catch (error) {
            console.error("[MapDisplay] Erreur sauvegarde Cloud:", error);
            alert("Une erreur est survenue lors de l'envoi.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        }
    },

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
