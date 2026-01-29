/**
 * modules/map_display.js
 * Gère le rendu Deck.gl et la sauvegarde Cloud vers Google Sheets.
 * Ajout : Affichage des couches Isochrones (GeoJsonLayer).
 */

export const MapDisplay = {
    deckgl: null,
    lastState: null,

    render(state) {
        console.log("[MapDisplay] Préparation du rendu...");
        this.lastState = state;

        if (!state.routes || state.routes.length === 0) return;

        const saveBtn = document.getElementById('btn-cloud-save');
        if (saveBtn && !saveBtn.dataset.init) {
            saveBtn.addEventListener('click', () => this.saveToSheets(this.lastState));
            saveBtn.dataset.init = "true";
        }

        const allTrajectoires = [];
        const allHeatmapPoints = [];

        // 1. Traitement des routes
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

        // 2. Définition des couleurs pour les isochrones (Vert -> Rouge)
        const isochroneColors = {
            2: [39, 174, 96, 100],   // 2km - Vert
            5: [241, 196, 15, 100],  // 5km - Jaune
            10: [230, 126, 34, 100], // 10km - Orange
            13: [231, 76, 60, 100]   // 13km - Rouge
        };

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
            
            // --- NOUVELLE COUCHE : ISOCHRONES ---
            new deck.GeoJsonLayer({
                id: 'isochrone-layer',
                data: { type: "FeatureCollection", features: state.isochrones || [] },
                pickable: true,
                stroked: true,
                filled: true,
                lineWidthMinPixels: 2,
                getFillColor: d => {
                    // OpenRouteService renvoie la distance en mètres (ex: 2000)
                    const distKm = d.properties.value / 1000;
                    return isochroneColors[distKm] || [100, 100, 100, 80];
                },
                getLineColor: [255, 255, 255, 150],
                getLineWidth: 1,
                opacity: 0.4
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

    addCloudLog(msg, type = 'info') {
        const terminal = document.getElementById('cloud-logs');
        if (!terminal) return;
        const color = type === 'error' ? '#f87171' : (type === 'success' ? '#4ad395' : '#38bdf8');
        terminal.innerHTML += `<br><span style="color: ${color}">> ${msg}</span>`;
        terminal.scrollTop = terminal.scrollHeight;
    },

    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');

        this.addCloudLog("Préparation de l'envoi cloud...");

        if (!siteName || !cityName) {
            this.addCloudLog("Erreur : Nom ou Ville manquant.", "error");
            alert("Veuillez remplir les informations du site.");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<span class="loader mr-2"></span>Sauvegarde...`;

        try {
            const analysisData = state.routes.map(r => ({
                id: r.id,
                start_lat: r.start_lat,
                start_lon: r.start_lon,
                end_lat: r.end_lat,
                end_lon: r.end_lon,
                distance_km: r.distance_km || '',
                duration_minutes: r.duration_min || '',
                status: r.status,
                error: r.error || ''
            }));

            const csvContent = Papa.unparse(analysisData);
            this.addCloudLog(`CSV d'analyse généré : ${analysisData.length} lignes.`);

            const pointsGeoJson = {
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

            const linesGeoJson = {
                type: "FeatureCollection",
                features: state.routes.filter(r => r.status === 'success').map(r => ({
                    type: "Feature",
                    properties: { id: r.id, dist: r.distance_km },
                    geometry: { type: "LineString", coordinates: this.decodePolyline(r.geometry) }
                }))
            };

            const payload = {
                field1: siteName,
                field2: cityName,
                field3: JSON.stringify(pointsGeoJson),
                field4: JSON.stringify(linesGeoJson),
                field5: csvContent
            };

            const url = "https://script.google.com/macros/s/AKfycbxgTYcx-62MBamAawDtt3IMgMAFCkudO49be8amsULPoeNkXiYLuh3dXK8zLd9u-hoyAA/exec";

            this.addCloudLog("Envoi en cours (Mode no-cors)...");

            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });

            this.addCloudLog("Succès ! CSV d'analyse transmis en 5ème colonne.", "success");
            alert("Données sauvegardées !");

        } catch (error) {
            this.addCloudLog(`Erreur : ${error.message}`, "error");
            console.error(error);
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


