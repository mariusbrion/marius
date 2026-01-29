/**
 * modules/map_display.js
 * Ordre : 2km au-dessus. Opacité : 15%. Sauvegarde : 8 colonnes.
 */

export const MapDisplay = {
    deckgl: null,
    lastState: null,

    render(state) {
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
                allTrajectoires.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
                coords.forEach(p => allHeatmapPoints.push({ coords: p }));
            }
        });

        // TRI POUR EMPILEMENT : On trie pour avoir le 10km en premier dans le tableau (fond) et 2km en dernier (top)
        const isochroneFeatures = state.isochrones 
            ? [...state.isochrones].sort((a, b) => b.properties.range_km - a.properties.range_km) 
            : [];

        const layers = [
            new deck.TileLayer({
                id: 'base-map-tiles',
                data: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                renderSubLayers: props => {
                    const { bbox: { west, south, east, north } } = props.tile;
                    return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
                }
            }),

            new deck.GeoJsonLayer({
                id: 'isochrones-layer',
                data: { type: "FeatureCollection", features: isochroneFeatures },
                pickable: true, stroked: true, filled: true,
                opacity: 0.15, // Consigne : 15% opacité
                getFillColor: d => this.getIsochroneColor(d.properties.range_km),
                getLineColor: [255, 255, 255, 100],
                getLineWidth: 1
            }),

            new deck.HeatmapLayer({
                id: 'heatmap-layer',
                data: allHeatmapPoints,
                getPosition: d => d.coords,
                radiusPixels: 35, intensity: 1, threshold: 0.05
            }),

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
        if (km <= 2) return [46, 204, 113];   // Vert
        if (km <= 5) return [241, 196, 15];  // Jaune
        return [230, 126, 34];               // Orange (10km)
    },

    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');
        if (!siteName || !cityName) { alert("Remplissez les champs Site et Ville."); return; }

        btn.disabled = true;
        btn.innerHTML = `<span class="loader mr-2"></span>Export...`;

        try {
            const analysisData = state.routes.map(r => ({
                id: r.id, start_lat: r.start_lat, start_lon: r.start_lon, end_lat: r.end_lat, end_lon: r.end_lon,
                distance_km: r.distance_km || '', duration_minutes: r.duration_min || '', status: r.status, error: r.error || ''
            }));

            const ptsGeo = { type: "FeatureCollection", features: state.coordinates.flatMap(c => [
                { type: "Feature", properties: { id: c.id, type: "dep" }, geometry: { type: "Point", coordinates: [c.start_lon, c.start_lat] } },
                { type: "Feature", properties: { id: c.id, type: "arr" }, geometry: { type: "Point", coordinates: [c.end_lon, c.end_lat] } }
            ])};

            const lnsGeo = { type: "FeatureCollection", features: state.routes.filter(r => r.status === 'success').map(r => ({
                type: "Feature", properties: { id: r.id }, geometry: { type: "LineString", coordinates: this.decodePolyline(r.geometry) }
            }))};

            // FILTRAGE DES ISOCHRONES PAR DISTANCE POUR LES COLONNES 6, 7, 8
            const getIsoByKm = (km) => ({
                type: "FeatureCollection",
                features: (state.isochrones || []).filter(f => f.properties.range_km === km)
            });

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
            await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });

            alert("Données sauvegardées (8 colonnes) !");
        } catch (error) {
            console.error(error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span>Sauvegarder les données</span>`;
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
