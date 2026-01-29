/**
 * modules/map_display.js
 * Gère le rendu Deck.gl et la sauvegarde Cloud vers Google Sheets.
 * Correction : Alignement sur le format JSON brut pour Apps Script.
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
     * Système de Logs Visuel amélioré
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
     * Correction : Utilisation du format JSON brut (JSON.stringify)
     */
    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');

        this.addCloudLog("Démarrage de la procédure de sauvegarde...");

        if (!siteName || !cityName) {
            this.addCloudLog("Erreur : Champs obligatoires vides.", "error");
            alert("Veuillez remplir Nom du site et Ville.");
            return;
        }

        btn.disabled = true;
        const oldText = btn.innerHTML;
        btn.innerText = "Traitement...";

        try {
            // file1 : RawData
            const file1 = state.rawData;
            const file1Str = JSON.stringify(file1);
            this.addCloudLog(`CSV : ${file1.length} lignes (${(file1Str.length / 1024).toFixed(1)} KB)`);

            // file2 : Points (GeoJSON)
            const file2 = {
                type: "FeatureCollection",
                features: state.coordinates.flatMap(c => [
                    {
                        type: "Feature",
                        properties: { id: c.id, type: "depart", addr: c.employee_address },
                        geometry: { type: "Point", coordinates: [c.start_lon, c.start_lat] }
                    },
                    {
                        type: "Feature",
                        properties: { id: c.id, type: "arrivee", addr: c.employer_address },
                        geometry: { type: "Point", coordinates: [c.end_lon, c.end_lat] }
                    }
                ])
            };
            const file2Str = JSON.stringify(file2);
            this.addCloudLog(`Points : ${file2.features.length} features (${(file2Str.length / 1024).toFixed(1)} KB)`);

            // file3 : Lignes (GeoJSON décodé)
            const file3 = {
                type: "FeatureCollection",
                features: state.routes.filter(r => r.status === 'success').map(r => ({
                    type: "Feature",
                    properties: { id: r.id, dist: r.distance_km, dur: r.duration_min },
                    geometry: { type: "LineString", coordinates: this.decodePolyline(r.geometry) }
                }))
            };
            const file3Str = JSON.stringify(file3);
            this.addCloudLog(`Lignes : ${file3.features.length} tracés (${(file3Str.length / 1024).toFixed(1)} KB)`);

            // Payload - Construction d'un objet JSON plat comme dans ton exemple réussi
            const payload = {
                field1: siteName,
                field2: cityName,
                field3: file1Str,
                field4: file2Str,
                field5: file3Str
            };

            this.addCloudLog("Envoi en cours vers Google Script...");

            const url = "https://script.google.com/macros/s/AKfycbwTDUwHS5Z27PgGr3Vu73kwgUXQ4iJyXjwlB8faTVydZ4RyA8nQ_GWYzFdmify4EYLxYA/exec";

            // Utilisation du format fetch exact de ton exemple qui marche
            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            this.addCloudLog("Transmission terminée (Statut opaque).", "success");
            this.addCloudLog("Vérifiez votre Google Sheet.", "success");
            alert("Données sauvegardées !");

        } catch (error) {
            this.addCloudLog(`Erreur critique : ${error.message}`, "error");
            console.error(error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = oldText;
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
