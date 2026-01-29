/**
 * modules/map_display.js
 * Gère le rendu Deck.gl et la sauvegarde Cloud vers Google Sheets.
 * Version : CSV en 5ème colonne et GeoJSON séparés.
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
     * Nouvel Ordre : field1:Site, field2:Ville, field3:Points, field4:Lignes, field5:CSV
     */
    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');

        this.addCloudLog("Déclenchement de la sauvegarde Cloud...");

        if (!siteName || !cityName) {
            this.addCloudLog("Erreur : Nom du site ou ville manquants.", "error");
            alert("Veuillez renseigner le nom du site et la ville.");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<span class="loader mr-2"></span>Envoi...`;

        try {
            // 1. GeoJSON Points
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

            // 2. GeoJSON Lignes
            const linesGeoJson = {
                type: "FeatureCollection",
                features: state.routes.filter(r => r.status === 'success').map(r => ({
                    type: "Feature",
                    properties: { id: r.id, dist: r.distance_km, dur: r.duration_min },
                    geometry: { type: "LineString", coordinates: this.decodePolyline(r.geometry) }
                }))
            };

            // 3. Payload avec CSV en field5
            const payload = {
                field1: siteName,
                field2: cityName,
                field3: JSON.stringify(pointsGeoJson), // Points en Col 3
                field4: JSON.stringify(linesGeoJson),  // Lignes en Col 4
                field5: JSON.stringify(state.rawData)  // CSV en Col 5
            };

            const csvSize = (payload.field5.length / 1024).toFixed(1);
            const ptsSize = (payload.field3.length / 1024).toFixed(1);
            const lnsSize = (payload.field4.length / 1024).toFixed(1);

            this.addCloudLog(`Préparation finie. Points: ${ptsSize}KB, Lignes: ${lnsSize}KB, CSV: ${csvSize}KB.`);

            const url = "https://script.google.com/macros/s/AKfycbxgTYcx-62MBamAawDtt3IMgMAFCkudO49be8amsULPoeNkXiYLuh3dXK8zLd9u-hoyAA/exec";

            this.addCloudLog("Envoi vers Google Sheets...");

            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });

            this.addCloudLog("Transmission réussie ! Vérifiez la 5ème colonne de votre Sheet.", "success");
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
