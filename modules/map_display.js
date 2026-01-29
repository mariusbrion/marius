/**
 * modules/map_display.js
 * Gère le rendu Deck.gl et la sauvegarde Cloud vers Google Sheets (8 colonnes).
 */

export const MapDisplay = {
    deckgl: null,
    lastState: null,

    render(state) {
        console.log("[MapDisplay] Rendu de la carte...");
        this.lastState = state;

        if (!state.routes || state.routes.length === 0) return;

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

        // Tri des isochrones pour l'affichage (2km au dessus)
        const isochroneFeatures = state.isochrones 
            ? [...state.isochrones].sort((a, b) => b.properties.range_km - a.properties.range_km) 
            : [];

        const layers = [
            new deck.TileLayer({
                id: 'base-map-tiles',
                data: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                minZoom: 0, maxZoom: 19,
                renderSubLayers: props => {
                    const { bbox: { west, south, east, north } } = props.tile;
                    return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
                }
            }),
            // Isochrones (15% opacité)
            new deck.GeoJsonLayer({
                id: 'isochrones-layer',
                data: { type: "FeatureCollection", features: isochroneFeatures },
                pickable: true, stroked: true, filled: true,
                opacity: 0.15,
                getFillColor: d => this.getIsochroneColor(d.properties.range_km),
                getLineColor: [255, 255, 255, 100],
                getLineWidth: 1
            }),
            // Heatmap
            new deck.HeatmapLayer({
                id: 'heatmap-layer',
                data: allHeatmapPoints,
                getPosition: d => d.coords,
                radiusPixels: 35, intensity: 1, threshold: 0.05
            }),
            // Trajets (Invisibles)
            new deck.GeoJsonLayer({
                id: 'routes-layer-internal',
                data: { type: "FeatureCollection", features: allTrajectoires },
                visible: false, pickable: true
            })
        ];

        if (!this.deckgl) {
            this.deckgl = new deck.DeckGL({
                container: 'map-container',
                initialViewState: this.calculateInitialView(allHeatmapPoints),
                controller: true,
                layers: layers,
                getTooltip: ({object}) => object && object.properties.range_km && `Isochrone: ${object.properties.range_km} km`
            });
        } else {
            this.deckgl.setProps({ layers, initialViewState: this.calculateInitialView(allHeatmapPoints) });
        }
    },

    getIsochroneColor(km) {
        if (km <= 2) return [46, 204, 113];
        if (km <= 5) return [241, 196, 15];
        return [230, 126, 34];
    },

    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');

        if (!siteName || !cityName) {
            alert("Veuillez renseigner le Nom du site et la Ville.");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<span class="loader mr-2"></span>Envoi...`;

        try {
            // CSV Analyse
            const analysisData = state.routes.map(r => ({
                id: r.id, start_lat: r.start_lat, start_lon: r.start_lon, end_lat: r.end_lat, end_lon: r.end_lon,
                distance_km: r.distance_km || '', duration_minutes: r.duration_min || '', status: r.status, error: r.error || ''
            }));

            // GeoJSONs
            const ptsGeo = { type: "FeatureCollection", features: state.coordinates.flatMap(c => [
                { type: "Feature", properties: { id: c.id, type: "dep" }, geometry: { type: "Point", coordinates: [c.start_lon, c.start_lat] } },
                { type: "Feature", properties: { id: c.id, type: "arr" }, geometry: { type: "Point", coordinates: [c.end_lon, c.end_lat] } }
            ])};

            const lnsGeo = { type: "FeatureCollection", features: state.routes.filter(r => r.status === 'success').map(r => ({
                type: "Feature", properties: { id: r.id }, geometry: { type: "LineString", coordinates: this.decodePolyline(r.geometry) }
            }))};

            // Fonction helper pour filtrer les isochrones
            const getIsoByKm = (km) => ({
                type: "FeatureCollection",
                features: (state.isochrones || []).filter(f => f.properties.range_km === km)
            });

            // Payload 8 Colonnes
            const payload = {
                field1: siteName,
                field2: cityName,
                field3: JSON.stringify(ptsGeo),
                field4: JSON.stringify(lnsGeo),
                field5: Papa.unparse(analysisData),
                field6: JSON.stringify(getIsoByKm(2)),  // Isochrone 2km
                field7: JSON.stringify(getIsoByKm(5)),  // Isochrone 5km
                field8: JSON.stringify(getIsoByKm(10))  // Isochrone 10km
            };

            const url = "https://script.google.com/macros/s/AKfycbxgTYcx-62MBamAawDtt3IMgMAFCkudO49be8amsULPoeNkXiYLuh3dXK8zLd9u-hoyAA/exec";

            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });

            alert("Données sauvegardées avec succès !");

        } catch (error) {
            console.error(error);
            alert("Erreur lors de l'envoi.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span>Sauvegarder (Sheets)</span>`;
        }
    },

    decodePolyline(str, precision = 5) {
        let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null, lat_c, lng_c, factor = Math.pow(10, precision);
        while (index < str.length) {
            byte = null; shift = 0; result = 0;
            do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lat_c = ((result & 1) ? ~(result >> 1) : (result >> 1));
            shift = result = 0;
            do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lng_c = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += lat_c; lng += lng_c;
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
