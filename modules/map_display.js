/**
 * modules/map_display.js
 * Rendu Deck.gl (Points Verts/Rouges + Heatmap + Isochrones)
 * Export Sheets : 3 colonnes uniquement (Site, Ville, CSV)
 */

export const MapDisplay = {
    deckgl: null,
    lastState: null,

    render(state) {
        this.lastState = state;
        if (!state.routes || state.routes.length === 0) return;

        // Liaison du bouton de sauvegarde
        const saveBtn = document.getElementById('btn-cloud-save');
        if (saveBtn && !saveBtn.dataset.init) {
            saveBtn.addEventListener('click', () => this.saveToSheets(this.lastState));
            saveBtn.dataset.init = "true";
        }

        const allTrajectoryPoints = [];
        const pointFeatures = [];

        // 1. Préparation des trajectoires (Heatmap) et des points (Départ/Arrivée)
        state.routes.forEach(route => {
            if (route.status === 'success' && route.geometry) {
                const coords = this.decodePolyline(route.geometry);
                
                // Points pour la Heatmap (tous les points du tracé)
                coords.forEach(p => allTrajectoryPoints.push({ coords: p }));

                // Point de départ (Employé) -> Vert
                pointFeatures.push({
                    type: "Feature",
                    properties: { type: 'depart', id: route.id },
                    geometry: { type: "Point", coordinates: [route.start_lon, route.start_lat] }
                });

                // Point d'arrivée (Entreprise) -> Rouge
                pointFeatures.push({
                    type: "Feature",
                    properties: { type: 'arrivee', id: route.id },
                    geometry: { type: "Point", coordinates: [route.end_lon, route.end_lat] }
                });
            }
        });

        // 2. Tri des isochrones pour l'empilement (10km fond -> 2km dessus)
        const isochroneFeatures = state.isochrones 
            ? [...state.isochrones].sort((a, b) => b.properties.range_km - a.properties.range_km) 
            : [];

        // 3. Définition des Layers Deck.gl
        const layers = [
            new deck.TileLayer({
                id: 'base-tiles',
                data: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                renderSubLayers: props => {
                    const { bbox: { west, south, east, north } } = props.tile;
                    return new deck.BitmapLayer(props, {
                        data: null, image: props.data,
                        bounds: [west, south, east, north]
                    });
                }
            }),

            new deck.GeoJsonLayer({
                id: 'isochrones-layer',
                data: { type: "FeatureCollection", features: isochroneFeatures },
                pickable: true, stroked: true, filled: true,
                opacity: 0.15,
                getFillColor: d => this.getIsochroneColor(d.properties.range_km),
                getLineColor: [255, 255, 255, 100],
                getLineWidth: 1
            }),

            new deck.HeatmapLayer({
                id: 'heatmap-layer',
                data: allTrajectoryPoints,
                getPosition: d => d.coords,
                radiusPixels: 35,
                intensity: 1,
                threshold: 0.05,
                aggregation: 'SUM'
            }),

            new deck.GeoJsonLayer({
                id: 'points-layer',
                data: { type: "FeatureCollection", features: pointFeatures },
                pickable: true,
                getFillColor: d => d.properties.type === 'arrivee' ? [239, 68, 68] : [34, 197, 94], // Rouge vs Vert
                getPointRadius: 25,
                pointRadiusMinPixels: 4
            })
        ];

        // 4. Initialisation ou Mise à jour de la carte
        if (!this.deckgl) {
            this.deckgl = new deck.DeckGL({
                container: 'map-container',
                initialViewState: this.calculateInitialView(allTrajectoryPoints),
                controller: true,
                layers: layers,
                getTooltip: ({object}) => {
                    if (!object) return null;
                    if (object.properties.range_km) return `Isochrone: ${object.properties.range_km} km`;
                    if (object.properties.type) return object.properties.type === 'arrivee' ? "Site Employeur" : "Départ Employé";
                    return null;
                }
            });
        } else {
            this.deckgl.setProps({ layers, initialViewState: this.calculateInitialView(allTrajectoryPoints) });
        }
    },

    getIsochroneColor(km) {
        if (km <= 2) return [46, 204, 113];   // Vert
        if (km <= 5) return [241, 196, 15];   // Jaune
        return [230, 126, 34];                // Orange (10km)
    },

    /**
     * Export vers Google Sheets (Version Simplifiée : 3 Colonnes)
     */
    async saveToSheets(state) {
        const siteName = document.getElementById('input-site-name')?.value.trim();
        const cityName = document.getElementById('input-city')?.value.trim();
        const btn = document.getElementById('btn-cloud-save');

        if (!siteName || !cityName) { 
            alert("Veuillez renseigner le Nom du Site et la Ville avant de sauvegarder."); 
            return; 
        }

        btn.disabled = true;
        btn.innerHTML = `<span class="animate-pulse">Export...</span>`;

        try {
            // Préparation des données CSV (analyse complète)
            const analysisData = state.routes.map(r => ({
                id: r.id,
                adresse_employe: r.employee_address,
                site_employeur: r.employer_address,
                distance_km: r.distance_km || 0,
                duree_min: r.duration_min || 0,
                status: r.status
            }));

            // Payload restreint à 3 champs comme demandé
            const payload = {
                field1: siteName,
                field2: cityName,
                field3: Papa.unparse(analysisData) // Le fichier CSV sous forme de texte
            };

            const url = "https://script.google.com/macros/s/AKfycbxgTYcx-62MBamAawDtt3IMgMAFCkudO49be8amsULPoeNkXiYLuh3dXK8zLd9u-hoyAA/exec";
            
            await fetch(url, { 
                method: 'POST', 
                mode: 'no-cors', 
                headers: { 'Content-Type': 'text/plain' }, 
                body: JSON.stringify(payload) 
            });

            alert("Données transmises avec succès au Google Sheet !");
        } catch (error) {
            console.error("[MapDisplay] Erreur d'export:", error);
            alert("Erreur lors de la sauvegarde.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span>Sauvegarder</span>`;
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
        if (points.length === 0) return { longitude: -0.57, latitude: 44.83, zoom: 11, pitch: 0, bearing: 0 };
        const avgLon = points.reduce((s, p) => s + p.coords[0], 0) / points.length;
        const avgLat = points.reduce((s, p) => s + p.coords[1], 0) / points.length;
        return { 
            longitude: avgLon, 
            latitude: avgLat, 
            zoom: 11, 
            pitch: 0, 
            bearing: 0,
            transitionDuration: 1000
        };
    }
};
