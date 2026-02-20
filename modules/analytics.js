/**
 * modules/analytics.js
 * Dashboard interactif + Générateur d'Audit PDF Professionnel
 * Version 2.0 : Logique sélective et interface aérée
 */

export const Analytics = {
    appState: null,
    currentChart: null,
    currentViewMode: 'distance', // 'distance' ou 'time'

    /**
     * Initialisation appelée par main.js
     */
    init(state) {
        this.appState = state;
        console.log("[Analytics] Initialisation du Dashboard...");
        
        // Rendu immédiat des stats sur la page
        this.renderDashboardUI();

        // Liaison des boutons d'interaction (s'ils existent dans le HTML)
        this.bindEvents();
    },

    /**
     * Liaison des événements UI
     */
    bindEvents() {
        // Bouton PDF
        const pdfBtn = document.getElementById('pdfBtn');
        if (pdfBtn && !pdfBtn.dataset.init) {
            pdfBtn.addEventListener('click', () => this.exportFullAuditPDF());
            pdfBtn.dataset.init = "true";
        }

        // Toggles pour changer de vue (Distance / Temps VAE)
        const toggleDist = document.getElementById('toggle-dist');
        const toggleTime = document.getElementById('toggle-time');

        if (toggleDist) toggleDist.onclick = () => {
            this.currentViewMode = 'distance';
            this.renderDashboardUI();
        };
        if (toggleTime) toggleTime.onclick = () => {
            this.currentViewMode = 'time';
            this.renderDashboardUI();
        };
    },

    /**
     * 1. LOGIQUE DE CALCUL (Segmentation)
     */
    categorizeData(mode, isVAE = false) {
        const routes = this.appState.routes || [];
        const total = routes.length;
        const categories = {};

        if (mode === 'distance') {
            categories['0-2 km'] = 0; categories['2-5 km'] = 0; 
            categories['5-10 km'] = 0; categories['10+ km'] = 0;
            routes.forEach(r => {
                const d = parseFloat(r.distance_km);
                if (d <= 2) categories['0-2 km']++;
                else if (d <= 5) categories['2-5 km']++;
                else if (d <= 10) categories['5-10 km']++;
                else categories['10+ km']++;
            });
        } else {
            categories['0-10 min'] = 0; categories['10-15 min'] = 0; 
            categories['15-20 min'] = 0; categories['20+ min'] = 0;
            routes.forEach(r => {
                let d = parseFloat(r.duration_min);
                if (isVAE) d *= 0.75; // Simulation VAE (-25%)
                if (d <= 10) categories['0-10 min']++;
                else if (d <= 15) categories['10-15 min']++;
                else if (d <= 20) categories['15-20 min']++;
                else categories['20+ min']++;
            });
        }

        const percentages = {};
        Object.keys(categories).forEach(k => {
            percentages[k] = total > 0 ? (categories[k] / total) * 100 : 0;
        });

        return { categories, percentages, total };
    },

    /**
     * 2. LOGIQUE RÉDACTIONNELLE SÉLECTIVE (PDF)
     */
    generateDistanceComment(stats) {
        const pUnder5 = stats.percentages['0-2 km'] + stats.percentages['2-5 km'];
        const pUnder10 = pUnder5 + stats.percentages['5-10 km'];
        const totalUnder5 = Math.round((pUnder5 / 100) * stats.total);

        let text = `Analyse de la répartition géographique : ${pUnder5.toFixed(1)}% des effectifs résident à moins de 5km du site. `;

        // Choix sélectif de la phrase Potentiel Proximité
        if (pUnder5 > 30) {
            text += `Ceci représente un gisement très important pour le report modal vers le vélo musculaire ou électrique. Concrètement, cela concerne environ ${totalUnder5} collaborateurs qui pourraient abandonner la voiture individuelle au profit de la mobilité active.`;
        } else if (pUnder5 > 15) {
            text += "Un potentiel modéré mais existant pour la mobilité douce de proximité. Des actions de sensibilisation ciblées pourraient favoriser le passage au vélo.";
        } else {
            text += "L'éloignement géographique est marqué sur la très courte distance. La majorité des collaborateurs habitent au-delà du périmètre de marche ou de vélo classique.";
        }

        text += "\n\n";

        // Choix sélectif de la phrase Périmètre Urbain
        if (pUnder10 > 40) {
            text += `En milieu urbain, ce sont des distances où le vélo est souvent plus compétitif que la voiture en temps de trajet réel (prise en compte du stationnement et trafic), particulièrement avec l'assistance électrique qui lisse l'effort.`;
        } else {
            text += "Au-delà de 10km, le covoiturage ou les transports en commun deviennent des options stratégiques plus pertinentes pour compléter l'offre vélo.";
        }

        return text;
    },

    generateTimeComment(normalStats, bikeStats) {
        const u15Bike = bikeStats.percentages['0-10 min'] + bikeStats.percentages['10-15 min'];
        const u20Bike = u15Bike + bikeStats.percentages['15-20 min'];
        const countU20Bike = Math.round((u20Bike / 100) * bikeStats.total);
        
        let text = "L'impact du vélo électrique sur l'accessibilité est significatif. ";
        text += `Concrètement, l'assistance électrique permettrait à ${countU20Bike} employés de se rendre au travail en moins de 20 minutes... un seuil de basculement psychologique très réaliste pour un changement d'habitude durable.`;
        
        text += "\n\nLe gain de fluidité et la réduction de la fatigue liée aux embouteillages sont des facteurs clés de Qualité de Vie au Travail (QVT) et de ponctualité.";

        return text;
    },

    /**
     * 3. RENDU DES GRAPHIQUES (UI & PDF)
     */
    async generateInvisibleChart(label, stats, color) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = 600; canvas.height = 300;
            canvas.style.position = 'absolute'; canvas.style.left = '-9999px';
            document.body.appendChild(canvas);

            new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: Object.keys(stats.categories),
                    datasets: [{ data: Object.values(stats.percentages), backgroundColor: color, borderRadius: 5 }]
                },
                options: {
                    animation: false,
                    plugins: { legend: { display: false } },
                    scales: { 
                        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                    }
                }
            });

            setTimeout(() => {
                const img = canvas.toDataURL('image/png');
                canvas.remove();
                resolve(img);
            }, 400);
        });
    },

    renderDashboardUI() {
        const dashboard = document.getElementById('analytics-dashboard');
        if (!dashboard) return;
        dashboard.classList.remove('hidden');

        const stats = this.categorizeData(this.currentViewMode, this.currentViewMode === 'time');
        const ctx = document.getElementById('interactiveChart');
        if (!ctx) return;

        if (this.currentChart) this.currentChart.destroy();
        this.currentChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(stats.categories),
                datasets: [{ 
                    label: '% des collaborateurs',
                    data: Object.values(stats.percentages), 
                    backgroundColor: this.currentViewMode === 'distance' ? '#4facfe' : '#2ed573', 
                    borderRadius: 8 
                }]
            },
            options: { 
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }, 
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } 
            }
        });

        // Mise à jour du résumé textuel dans l'UI
        const summary = document.getElementById('analytics-summary');
        if (summary) {
            const comment = this.currentViewMode === 'distance' 
                ? this.generateDistanceComment(stats) 
                : this.generateTimeComment(this.categorizeData('time', false), stats);
            
            summary.innerHTML = `
                <h4 class="font-bold text-indigo-900 mb-2 uppercase text-xs tracking-wider">
                    Analyse ${this.currentViewMode === 'distance' ? 'Géographique' : 'Temporelle (VAE)'}
                </h4>
                <p class="text-slate-600 text-sm italic leading-relaxed">"${comment.split('\n\n')[0]}"</p>
            `;
        }
    },

    /**
     * 4. EXPORT PDF ASYNCHRONE PROFESSIONNEL
     */
    async exportFullAuditPDF() {
        const btn = document.getElementById('pdfBtn');
        const originalText = btn.innerText;
        btn.innerText = "Génération...";
        btn.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;

            const addFooter = () => {
                doc.setFontSize(8); doc.setTextColor(160);
                const footerText = "Outil développé dans le cadre du CAVENA, diagnostic validé par la FUB pour la certification du label Employeur Pro Vélo.";
                doc.text(doc.splitTextToSize(footerText, pageWidth - 40), pageWidth / 2, 285, { align: 'center' });
            };

            // --- PAGE 1 : POTENTIEL GÉOGRAPHIQUE ---
            doc.setFontSize(24); doc.setTextColor(30, 41, 59);
            doc.text("Audit de Diagnostic Mobilité", margin, 30);
            
            doc.setFontSize(10); doc.setTextColor(100);
            const site = document.getElementById('input-site-name')?.value || "Site Principal";
            doc.text(`${site} - Effectif : ${this.appState.routes.length} collaborateurs`, margin, 40);

            doc.setFontSize(14); doc.setTextColor(79, 172, 254);
            doc.text("1. Répartition des distances domicile-travail", margin, 60);
            
            const distStats = this.categorizeData('distance');
            const distImg = await this.generateInvisibleChart('Distances', distStats, '#4facfe');
            doc.addImage(distImg, 'PNG', margin, 65, pageWidth - 40, 80);
            
            doc.setFontSize(11); doc.setTextColor(60);
            const distComment = this.generateDistanceComment(distStats);
            doc.text(doc.splitTextToSize(distComment, pageWidth - 40), margin, 155);
            addFooter();

            // --- PAGE 2 : PROJECTION VAE ---
            doc.addPage();
            doc.setFontSize(14); doc.setTextColor(79, 172, 254);
            doc.text("2. Projection Vélo à Assistance Électrique (VAE)", margin, 30);
            
            doc.setFontSize(10); doc.setTextColor(100);
            doc.text("Comparaison des temps de trajet pour identifier le potentiel de basculement.", margin, 40);

            const bikeStats = this.categorizeData('time', true);
            const bikeImg = await this.generateInvisibleChart('Temps VAE', bikeStats, '#2ed573');
            doc.addImage(bikeImg, 'PNG', margin, 50, pageWidth - 40, 80);

            doc.setFontSize(11); doc.setTextColor(60);
            const timeComment = this.generateTimeComment(this.categorizeData('time', false), bikeStats);
            doc.text(doc.splitTextToSize(timeComment, pageWidth - 40), margin, 140);
            addFooter();

            // Export final
            doc.save(`Audit_Mobilité_${site.replace(/\s+/g, '_')}.pdf`);
        } catch (e) {
            console.error("[Analytics] Erreur Export PDF:", e);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
};
