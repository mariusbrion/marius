/**
 * modules/map_display.js
 * Gère le rendu Deck.gl et la sauvegarde Cloud vers Google Sheets.
 * Inclut un système de logging pour débugger l'envoi.
 */

export const MapDisplay = {
    deckgl: null,
    lastState: null,

    /**
     * Initialisation du rendu cartographique
     */
    render(state) {
        console.log("[MapDisplay] Préparation du rendu...");
        this.lastState = state;

        if (!state.routes || state.routes.length === 0) return;

        // Configurer le bouton de sauvegarde (une seule fois)
        const saveBtn = document.getElementById('btn-cloud-save');
        if (saveBtn && !saveBtn.dataset.init) {
            saveBtn.addEventListener('click', () => this.saveToSheets(this.lastState));
            saveBtn.dataset.init = "true";
        }

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
                coords.forEach(p => allHeatmapPoints.push({ coords: p }));
            }
        });

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

        if (!this.deckgl) {
            this.deckgl = new deck.DeckGL({
                container: 'map-container',
                initialViewState: this.calculateInitialView(allHeatmapPoints),
                controller: true,
                layers: layers
            });
        } else {
            this.deckgl.setProps({ layers: layers, initialViewState: this.calculateInitialView(allHeatmapPoints) });
        }
    },

    /**
     * Système de Logs Visuel
     */
    addCloudLog(msg, type = 'info') {
        const terminal = document.getElementById('cloud-logs');
        if (!terminal) return;
        const color = type === 'error' ? '#f87171' : (type === 'success' ? '#4ad395' : '#38bdf8');
        terminal.innerHTML += `<br><span style="color: ${color}">> ${msg}</span>`;
        terminal.scrollTop = terminal.scrollHeight;
    },

    /**
     * Sauvegarde Cloud vers Google Sheets
     */
    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');

        this.addCloudLog("Démarrage de la procédure de sauvegarde...");

        if (!siteName || !cityName) {
            this.addCloudLog("Erreur : Nom du site ou Ville manquant.", "error");
            alert("Veuillez remplir les champs Nom du site et Ville.");
            return;
        }

        btn.disabled = true;
        btn.innerText = "Envoi...";

        try {
            // file1 : RawData
            const file1 = state.rawData;
            this.addCloudLog(`File 1 (Raw) prêt : ${file1.length} lignes.`);

            // file2 : Points (GeoJSON)
            const file2 = {
                type: "FeatureCollection",
                features: state.coordinates.flatMap(c => [
                    {
                        type: "Feature",
                        properties: { id: c.id, type: "depart" },
                        geometry: { type: "Point", coordinates: [c.start_lon, c.start_lat] }
                    },
                    {
                        type: "Feature",
                        properties: { id: c.id, type: "arrivee" },
                        geometry: { type: "Point", coordinates: [c.end_lon, c.end_lat] }
                    }
                ])
            };
            this.addCloudLog(`File 2 (Points) prêt : ${file2.features.length} points.`);

            // file3 : Lignes (GeoJSON)
            const file3 = {
                type: "FeatureCollection",
                features: state.routes.filter(r => r.status === 'success').map(r => ({
                    type: "Feature",
                    properties: { id: r.id, dist: r.distance_km },
                    geometry: { type: "LineString", coordinates: this.decodePolyline(r.geometry) }
                }))
            };
            this.addCloudLog(`File 3 (Lines) prêt : ${file3.features.length} tracés.`);

            // Payload
            const payload = new URLSearchParams();
            payload.append('field1', siteName);
            payload.append('field2', cityName);
            payload.append('field3', JSON.stringify(file1));
            payload.append('field4', JSON.stringify(file2));
            payload.append('field5', JSON.stringify(file3));

            this.addCloudLog("Payload généré. Envoi vers le script Google...");

            const url = "https://script.google.com/macros/s/AKfycbwTDUwHS5Z27PgGr3Vu73kwgUXQ4iJyXjwlB8faTVydZ4RyA8nQ_GWYzFdmify4EYLxYA/exec";

            // Envoi POST no-cors
            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: payload
            });

            this.addCloudLog("Requête envoyée avec succès (statut opaque via no-cors).", "success");
            this.addCloudLog("Vérifiez votre Google Sheet dans quelques secondes.", "success");
            alert("Données sauvegardées !");

        } catch (error) {
            this.addCloudLog(`Erreur réseau : ${error.message}`, "error");
            alert("Échec de la connexion au serveur.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span>Sauvegarder les données</span>`;
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
