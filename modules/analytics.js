/**
 * modules/analytics.js
 * Module indépendant pour l'analyse des données de mobilité et génération d'audit PDF.
 */

export const Analytics = {
    state: null,
    interactiveChartInstance: null,

    /**
     * Initialisation du module appelée par main.js
     * @param {Object} state - L'état global de l'application (appState)
     */
    init(state) {
        console.log("[Analytics] Initialisation du module...");
        this.state = state;
        
        // Activation visuelle du dashboard dans le DOM
        const dashboard = document.getElementById('analytics-dashboard');
        if (dashboard) dashboard.classList.remove('hidden');

        // Préparation des données (Mode Musculaire par défaut pour le dashboard)
        const muscularData = this.categorizeData(state.routes, 'muscular');
        
        // Rendu du graphique interactif
        this.renderInteractiveChart(muscularData);
        
        // Insertion du commentaire automatique pour les distances
        const summaryDiv = document.getElementById('analytics-summary');
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <h4 class="font-bold text-indigo-900 mb-2">Diagnostic de proximité</h4>
                <p class="text-slate-600 leading-relaxed italic">
                    "${this.generateDistanceComment(muscularData)}"
                </p>
            `;
        }

        // Configuration du bouton d'export PDF
        const pdfBtn = document.getElementById('pdfBtn');
        if (pdfBtn && !pdfBtn.dataset.init) {
            pdfBtn.addEventListener('click', () => this.generatePDF());
            pdfBtn.dataset.init = "true";
        }
    },

    /**
     * Segmente les données en catégories de distances et de temps
     * @param {Array} routes - Liste des itinéraires calculés
     * @param {string} mode - 'muscular' ou 'vae' (vélo électrique)
     */
    categorizeData(routes, mode = 'muscular') {
        const counts = {
            distances: { '0-2 km': 0, '2-5 km': 0, '5-10 km': 0, '10+ km': 0 },
            times: { '0-10 min': 0, '10-15 min': 0, '15-20 min': 0, '20+ min': 0 }
        };
        let validRoutes = 0;

        routes.forEach(r => {
            if (r.status !== 'success') return;
            validRoutes++;

            const d = parseFloat(r.distance_km);
            let t = parseFloat(r.duration_min);
            
            // LA FORMULE VAE : Réduction de 25% sur la durée de trajet
            if (mode === 'vae') {
                t = t * 0.75;
            }

            // Segmentation Distances
            if (d <= 2) counts.distances['0-2 km']++;
            else if (d <= 5) counts.distances['2-5 km']++;
            else if (d <= 10) counts.distances['5-10 km']++;
            else counts.distances['10+ km']++;

            // Segmentation Temps
            if (t <= 10) counts.times['0-10 min']++;
            else if (t <= 15) counts.times['10-15 min']++;
            else if (t <= 20) counts.times['15-20 min']++;
            else counts.times['20+ min']++;
        });

        // Calcul des pourcentages
        const percentages = { distances: {}, times: {} };
        for (let k in counts.distances) {
            percentages.distances[k] = validRoutes ? Math.round((counts.distances[k] / validRoutes) * 100) : 0;
        }
        for (let k in counts.times) {
            percentages.times[k] = validRoutes ? Math.round((counts.times[k] / validRoutes) * 100) : 0;
        }

        return { counts, percentages, total: validRoutes };
    },

    /**
     * Génère le graphique à barres interactif du Dashboard
     */
    renderInteractiveChart(data) {
        const ctx = document.getElementById('interactiveChart').getContext('2d');
        if (this.interactiveChartInstance) this.interactiveChartInstance.destroy();

        this.interactiveChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(data.percentages.distances),
                datasets: [{
                    label: 'Collaborateurs (%)',
                    data: Object.values(data.percentages.distances),
                    backgroundColor: '#4facfe',
                    borderRadius: 10,
                    barPercentage: 0.6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        max: 100, // Échelle fixe à 100%
                        ticks: { callback: value => value + '%' },
                        grid: { color: '#f1f5f9' }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    /**
     * Crée un graphique sur un canvas hors-champ pour l'export PDF
     */
    async createHiddenChart(canvasId, labels, dataObj, color, title) {
        return new Promise(resolve => {
            const ctx = document.getElementById(canvasId).getContext('2d');
            const existingChart = Chart.getChart(canvasId);
            if (existingChart) existingChart.destroy();

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{ 
                        label: title, 
                        data: dataObj, 
                        backgroundColor: color, 
                        borderRadius: 10 
                    }]
                },
                options: {
                    animation: false,
                    responsive: false,
                    scales: { 
                        y: { beginAtZero: true, max: 100 } 
                    },
                    plugins: { 
                        legend: { display: true } 
                    }
                }
            });

            setTimeout(() => {
                resolve(document.getElementById(canvasId).toDataURL('image/png'));
            }, 400);
        });
    },

    /**
     * ANALYSE DES DISTANCES (Logic rédactionnelle)
     */
    generateDistanceComment(data) {
        const p = data.percentages.distances;
        const c = data.counts.distances;
        const under5Perc = (p['0-2 km'] || 0) + (p['2-5 km'] || 0);
        const under5Count = (c['0-2 km'] || 0) + (c['2-5 km'] || 0);
        const under10Perc = under5Perc + (p['5-10 km'] || 0);

        if (under5Perc > 30) {
            return `Ceci représente un gisement très important pour le report modal vers le vélo musculaire ou électrique. Concrètement, cela concerne environ ${under5Count} collaborateurs qui pourraient abandonner la voiture individuelle.`;
        } else if (under5Perc >= 15 && under5Perc <= 30) {
            return "Un potentiel modéré mais existant pour la mobilité douce de proximité.";
        } else if (under5Perc < 15) {
            return "L'éloignement géographique est marqué sur la très courte distance.";
        } else if (under10Perc > 40) {
            return "En milieu urbain, ce sont des distances où le vélo est souvent plus compétitif que la voiture... particulièrement avec l'assistance électrique.";
        } else {
            return "Au-delà de 10km, le covoiturage ou les transports en commun deviennent des options stratégiques plus pertinentes.";
        }
    },

    /**
     * ANALYSE DU TEMPS & VAE (Logic rédactionnelle)
     */
    generateTimeComment(mData, vData) {
        const mP = mData.percentages.times;
        const vP = vData.percentages.times;
        const mUnder20 = (mP['0-10 min']||0) + (mP['10-15 min']||0) + (mP['15-20 min']||0);
        const vUnder20 = (vP['0-10 min']||0) + (vP['10-15 min']||0) + (vP['15-20 min']||0);
        const diff = vUnder20 - mUnder20;

        const vCount = vData.counts.times;
        const vaeUnder20Count = (vCount['0-10 min']||0) + (vCount['10-15 min']||0) + (vCount['15-20 min']||0);

        return [
            `L'introduction du vélo électrique permettrait d'augmenter cette proportion de +${diff} points.`,
            `Le gain de fluidité et la réduction de la fatigue liée aux embouteillages sont des facteurs clés de qualité de vie au travail (QVT).`,
            `Concrètement, l'assistance électrique permettrait à ${vaeUnder20Count} employés de se rendre au travail en moins de 20 minutes... un seuil de basculement très réaliste.`
        ];
    },

    /**
     * GÉNÉRATION DE L'AUDIT PDF (3 PAGES)
     */
    async generatePDF() {
        const btn = document.getElementById('pdfBtn');
        const originalContent = btn.innerHTML;
        btn.innerHTML = `<span class="animate-pulse">🔄 Audit en cours...</span>`;
        btn.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            const mData = this.categorizeData(this.state.routes, 'muscular');
            const vData = this.categorizeData(this.state.routes, 'vae');

            // 1. Préparation des images des graphiques
            const distImg = await this.createHiddenChart('pdfChartDistances', Object.keys(mData.percentages.distances), Object.values(mData.percentages.distances), '#4facfe', 'Distances - Musculaire (%)');
            const timeMImg = await this.createHiddenChart('pdfChartTimesMuscular', Object.keys(mData.percentages.times), Object.values(mData.percentages.times), '#4facfe', 'Temps - Musculaire (%)');
            const timeVImg = await this.createHiddenChart('pdfChartTimesVAE', Object.keys(vData.percentages.times), Object.values(vData.percentages.times), '#2ed573', 'Temps - VAE Électrique (%)');

            const totalEmployees = mData.total;
            const dateStr = new Date().toLocaleDateString('fr-FR');
            const siteName = document.getElementById('input-site-name')?.value || "Site Principal";
            const cityName = document.getElementById('input-city')?.value || "";
            const footer = "Outil développé dans le cadre du CAVENA... validé par la FUB pour la certification du label Employeur Pro Vélo.";

            // --- PAGE 1 : COUVERTURE & DISTANCES ---
            doc.setFontSize(24);
            doc.setTextColor(30, 41, 59);
            doc.text("AUDIT MOBILITÉ", 20, 30);
            doc.setFontSize(14);
            doc.text(`${siteName} ${cityName ? '- ' + cityName : ''}`, 20, 40);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Émis le : ${dateStr} | Échantillon : ${totalEmployees} collaborateurs`, 20, 50);

            doc.addImage(distImg, 'PNG', 20, 65, 170, 85);

            doc.setFontSize(13);
            doc.setTextColor(30, 41, 59);
            doc.text("Analyse du potentiel de proximité", 20, 165);
            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105);
            const distCommentLines = doc.splitTextToSize(this.generateDistanceComment(mData), 170);
            doc.text(distCommentLines, 20, 175);

            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(footer, 105, 285, { align: 'center' });

            // --- PAGE 2 : ANALYSE VAE ---
            doc.addPage();
            doc.setFontSize(18);
            doc.setTextColor(30, 41, 59);
            doc.text("Impact du Vélo à Assistance Électrique (VAE)", 20, 25);

            doc.addImage(timeMImg, 'PNG', 20, 40, 170, 75);
            doc.addImage(timeVImg, 'PNG', 20, 120, 170, 75);

            doc.setFontSize(13);
            doc.setTextColor(30, 41, 59);
            doc.text("Analyse de la performance temporelle", 20, 210);
            
            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105);
            let yOffset = 220;
            const timeComments = this.generateTimeComment(mData, vData);
            timeComments.forEach(text => {
                const lines = doc.splitTextToSize(text, 170);
                doc.text(lines, 20, yOffset);
                yOffset += (lines.length * 6) + 4;
            });

            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(footer, 105, 285, { align: 'center' });

            // --- PAGE 3 : CARTE DE CHALEUR ---
            doc.addPage();
            doc.setFontSize(18);
            doc.setTextColor(30, 41, 59);
            doc.text("Visualisation Géographique", 20, 25);
            
            doc.setFontSize(11);
            doc.setTextColor(100, 116, 139);
            doc.text("Diagnostic spatial des flux et zones de chaleur d'accessibilité.", 20, 35);
            
            // Cadre placeholder pour la carte
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(248, 250, 252);
            doc.rect(20, 45, 170, 120, 'FD');
            doc.setTextColor(148, 163, 184);
            doc.text("[ Capture de la Heatmap interactive ]", 105, 105, { align: 'center' });

            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(footer, 105, 285, { align: 'center' });

            // Export final
            doc.save(`Audit_Mobilite_${siteName.replace(/\s+/g, '_')}.pdf`);

        } catch (error) {
            console.error("[Analytics] Erreur durant la génération du PDF :", error);
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    }
};
