/**
 * modules/analytics.js
 * Dashboard interactif + Générateur d'Audit PDF Professionnel
 */

import { MapDisplay } from './map_display.js';

export const Analytics = {
    appState: null,
    currentChart: null,
    currentMode: 'distance', // 'distance' ou 'time'
    bikeMode: false,         // Simulation VAE activée

    init(state) {
        this.appState = state;
        console.log("[Analytics] Initialisation du Dashboard...");
        
        const dashboard = document.getElementById('analytics-dashboard');
        if (dashboard) dashboard.classList.remove('hidden');

        this.renderDashboardUI();
        this.bindEvents();
    },

    bindEvents() {
        // Bouton d'export PDF
        const pdfBtn = document.getElementById('pdfBtn');
        if (pdfBtn && !pdfBtn.dataset.init) {
            pdfBtn.addEventListener('click', () => this.exportFullAuditPDF());
            pdfBtn.dataset.init = "true";
        }

        const distanceBtn = document.getElementById('toggle-dist');
        const timeBtn = document.getElementById('toggle-time');
        const bikeBtn = document.getElementById('bike-toggle');

        if (distanceBtn) {
            distanceBtn.onclick = () => {
                this.currentMode = 'distance';
                distanceBtn.classList.add('active');
                if (timeBtn) timeBtn.classList.remove('active');
                if (bikeBtn) bikeBtn.classList.add('hidden');
                this.renderDashboardUI();
            };
        }

        if (timeBtn) {
            timeBtn.onclick = () => {
                this.currentMode = 'time';
                timeBtn.classList.add('active');
                if (distanceBtn) distanceBtn.classList.remove('active');
                if (bikeBtn) bikeBtn.classList.remove('hidden');
                this.renderDashboardUI();
            };
        }

        if (bikeBtn) {
            bikeBtn.onclick = () => {
                this.bikeMode = !this.bikeMode;
                bikeBtn.classList.toggle('active');
                bikeBtn.classList.toggle('bg-emerald-500');
                bikeBtn.classList.toggle('text-white');
                bikeBtn.textContent = this.bikeMode ? '🚲 Vélo électrique activé (-25%)' : '🚲 Vélo électrique (-25%)';
                this.renderDashboardUI();
            };
        }
    },

    /**
     * Segmentation des données
     */
    categorizeData(mode, isBike = false) {
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
                if (isBike) d *= 0.75; // Simulation VAE
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
     * Mise à jour de l'interface graphique
     */
    renderDashboardUI() {
        const { categories, percentages, total } = this.categorizeData(this.currentMode, this.bikeMode);
        
        const titleElem = document.getElementById('chart-title');
        if (titleElem) titleElem.textContent = this.currentMode === 'distance' ? 'Distribution par Distance' : 'Distribution par Temps';

        const ctx = document.getElementById('interactiveChart').getContext('2d');
        if (this.currentChart) this.currentChart.destroy();

        this.currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(categories),
                datasets: [{
                    data: Object.values(percentages),
                    backgroundColor: this.bikeMode && this.currentMode === 'time' ? '#2ed573' : '#4facfe',
                    borderRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
            }
        });

        this.updateStatsGrid(categories, total, Object.values(percentages));
    },

    updateStatsGrid(categories, total, percentages) {
        const grid = document.getElementById('statsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        Object.keys(categories).forEach((k, i) => {
            const val = Object.values(categories)[i];
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="stat-value">${val}</div>
                <div class="stat-label">${k}<br><span class="opacity-60">(${percentages[i].toFixed(1)}%)</span></div>
            `;
            grid.appendChild(card);
        });
    },

    /**
     * Commentaires rédactionnels nuancés pour le PDF
     */
    generateDistanceComment(stats) {
        const shortDist = stats.percentages['0-2 km'] + stats.percentages['2-5 km'];
        const mediumDist = stats.percentages['5-10 km'];
        const under10 = shortDist + mediumDist;

        let text = `Analyse de la répartition géographique : ${shortDist.toFixed(1)}% des effectifs résident à moins de 5km du site. `;

        if (shortDist > 30) {
            text += "Ceci représente un gisement très important pour le report modal vers le vélo. ";
            text += `Concrètement, cela concerne environ ${Math.round((shortDist/100)*stats.total)} collaborateurs qui pourraient abandonner la voiture individuelle. `;
        } else if (shortDist > 15) {
            text += "Un potentiel modéré mais existant pour la mobilité douce. ";
        } else {
            text += "L'éloignement géographique est marqué sur la courte distance. ";
        }

        if (mediumDist > 10 || under10 > 40) {
            text += `Notez que ${under10.toFixed(1)}% des effectifs se situent à moins de 10km. `;
            text += "Sur ces distances, le vélo électrique est souvent plus compétitif que la voiture en temps de trajet réel.";
        }
        return text;
    },

    generateTimeComment(normalStats, bikeStats) {
        const totalEmployees = normalStats.total;
        const under15Car = normalStats.percentages['0-10 min'] + normalStats.percentages['10-15 min'];
        const under15Bike = bikeStats.percentages['0-10 min'] + bikeStats.percentages['10-15 min'];
        const under20Bike = under15Bike + bikeStats.percentages['15-20 min'];
        const countUnder20Bike = Math.round((under20Bike / 100) * totalEmployees);
        
        let text = `Impact temporel : Actuellement, ${under15Car.toFixed(1)}% des trajets font moins de 15 min. `;
        
        if (under15Bike > under15Car) {
            const gain = (under15Bike - under15Car).toFixed(1);
            text += `Le vélo électrique augmenterait cette part de +${gain} points. `;
            text += `Concrètement, ${countUnder20Bike} employés arriveraient en moins de 20 min. `;
        }
        return text;
    },

    async generateInvisibleChart(label, stats, color = '#4facfe') {
        return new Promise((resolve) => {
            const container = document.getElementById('pdf-hidden-generator');
            const canvas = document.createElement('canvas');
            canvas.width = 800; canvas.height = 400;
            container.appendChild(canvas);

            new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: Object.keys(stats.categories),
                    datasets: [{ data: Object.values(stats.percentages), backgroundColor: color, borderRadius: 6 }]
                },
                options: { animation: false, responsive: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
            });

            setTimeout(() => {
                const data = canvas.toDataURL('image/png');
                container.innerHTML = '';
                resolve(data);
            }, 300);
        });
    },

    /**
     * Export PDF Final sur 3 pages avec capture de carte
     */
    async exportFullAuditPDF() {
        const btn = document.getElementById('pdfBtn');
        btn.textContent = "Génération...";
        btn.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const softBlue = [79, 172, 254];

            const addFooter = () => {
                doc.setFontSize(8); doc.setTextColor(150);
                const footer = "Outil développé dans le cadre du CAVENA, validé par la FUB pour le label Employeur Pro Vélo.";
                doc.text(doc.splitTextToSize(footer, pageWidth - 40), pageWidth / 2, 285, { align: 'center' });
            };

            // PAGE 1: DISTANCES
            doc.setTextColor(...softBlue); doc.setFontSize(22); doc.setFont("helvetica", "bold");
            doc.text("Rapport de Diagnostic Mobilité", pageWidth / 2, 25, { align: 'center' });
            
            const distStats = this.categorizeData('distance', false);
            const distImg = await this.generateInvisibleChart('Distances', distStats, '#4facfe');
            doc.setFontSize(14); doc.text("1. Analyse des Distances", margin, 60);
            doc.addImage(distImg, 'PNG', margin, 65, pageWidth - 40, 70);
            doc.setFontSize(10); doc.setTextColor(100);
            doc.text(doc.splitTextToSize(this.generateDistanceComment(distStats), pageWidth - 40), margin, 145);
            addFooter();

            // PAGE 2: TEMPS & VAE
            doc.addPage();
            doc.setTextColor(...softBlue); doc.setFontSize(14);
            doc.text("2. Analyse des Temps (Simulation VAE)", margin, 20);
            const timeBikeStats = this.categorizeData('time', true);
            const bikeImg = await this.generateInvisibleChart('VAE', timeBikeStats, '#2ed573');
            doc.addImage(bikeImg, 'PNG', margin, 30, pageWidth - 40, 70);
            doc.setFontSize(10); doc.setTextColor(100);
            doc.text(doc.splitTextToSize(this.generateTimeComment(this.categorizeData('time', false), timeBikeStats), pageWidth - 40), margin, 110);
            addFooter();

            // PAGE 3: CARTE DE CHALEUR
            doc.addPage();
            doc.setTextColor(...softBlue); doc.setFontSize(14);
            doc.text("3. Cartographie des Flux", margin, 20);
            const mapImg = MapDisplay.getMapImage();
            if (mapImg) {
                doc.addImage(mapImg, 'PNG', margin, 30, pageWidth - 40, 100);
            }
            addFooter();

            doc.save("Audit_Mobilite.pdf");
        } catch (e) { console.error(e); } 
        finally {
            btn.textContent = "Export Audit PDF";
            btn.disabled = false;
        }
    }
};
