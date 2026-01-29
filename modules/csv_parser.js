/**
 * modules/csv_parser.js
 * Gère l'importation, la validation et la transformation des données CSV.
 * Format d'entrée : 4 colonnes (Rue, Commune, CP, Site employeur)
 * Format de sortie : 2 colonnes (adresse employé, adresse employeur)
 */

export const CSVParser = {
    originalData: [],
    convertedData: [],
    fileName: '',

    /**
     * Initialisation du module
     */
    init() {
        console.log("[CSVParser] Initialisation...");
        
        const fileInput = document.getElementById('csv-input');
        const parseBtn = document.getElementById('btn-parse-csv');

        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
        }

        if (parseBtn) {
            parseBtn.addEventListener('click', () => this.processConversion());
        }
    },

    /**
     * Gère la sélection du fichier et la lecture initiale
     */
    handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showError('Le fichier doit être au format .csv');
            return;
        }

        this.fileName = file.name;
        this.readFile(file);
    },

    /**
     * Lecture du fichier via PapaParse (ou FileReader en fallback)
     */
    readFile(file) {
        // On utilise PapaParse s'il est disponible (chargé via CDN dans index.html)
        if (typeof Papa !== 'undefined') {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: (results) => {
                    this.originalData = results.data;
                    this.updateFileUI();
                },
                error: (err) => this.showError(`Erreur de lecture : ${err.message}`)
            });
        } else {
            // Fallback manuel si PapaParse n'est pas chargé
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                this.originalData = this.simpleCSVParse(text);
                this.updateFileUI();
            };
            reader.readAsText(file);
        }
    },

    /**
     * Transformation des 4 colonnes vers 2 colonnes (Logique métier originale)
     */
    processConversion() {
        if (this.originalData.length === 0) {
            this.showError('Aucune donnée à traiter.');
            return;
        }

        try {
            this.convertedData = this.originalData.map(row => {
                const values = Object.values(row);
                
                // Extraction selon votre logique originale
                let rue = (values[0] || '').toString().trim();
                let commune = (values[1] || '').toString().trim();
                let cp = (values[2] || '').toString().trim();
                let site = (values[3] || '').toString().trim();

                // Construction de l'adresse employé : "Commune;Rue (CP)"
                let addrE = commune && rue ? `${commune};${rue}` : (commune || rue || '');
                if (cp && addrE) addrE += ` (${cp})`;

                return { 
                    'adresse employé': addrE, 
                    'adresse employeur': site 
                };
            });

            this.emitNextStep();
        } catch (error) {
            this.showError(`Erreur de conversion : ${error.message}`);
        }
    },

    /**
     * Envoie les données vers le main.js (Orchestrateur)
     */
    emitNextStep() {
        console.log("[CSVParser] Conversion réussie, envoi des données...");

        const event = new CustomEvent('nextStep', {
            detail: {
                data: { rawData: this.convertedData },
                next: 'step-geo'
            }
        });

        window.dispatchEvent(event);
    },

    /**
     * Mise à jour de l'interface utilisateur spécifique à l'étape 1
     */
    updateFileUI() {
        const section = document.getElementById('step-csv');
        // On cherche ou crée un petit indicateur de succès
        let infoBox = document.getElementById('csv-info-display');
        
        if (!infoBox) {
            infoBox = document.createElement('div');
            infoBox.id = 'csv-info-display';
            infoBox.className = "mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm";
            section.querySelector('.space-y-4').insertBefore(infoBox, document.getElementById('btn-parse-csv'));
        }

        infoBox.innerHTML = `
            <div class="flex items-center space-x-2 text-indigo-700">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"></path></svg>
                <span class="font-bold">${this.fileName}</span>
            </div>
            <p class="text-slate-500 mt-1">${this.originalData.length} lignes détectées. Prêt pour la conversion.</p>
        `;
    },

    showError(message) {
        console.error(`[CSVParser] ${message}`);
        const infoBox = document.getElementById('csv-info-display');
        if (infoBox) {
            infoBox.className = "mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium";
            infoBox.innerText = `⚠️ ${message}`;
        }
    },

    /**
     * Fallback minimal si PapaParse n'est pas chargé
     */
    simpleCSVParse(text) {
        const lines = text.split('\n').filter(l => l.trim() !== '');
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map(line => {
            const data = line.split(',');
            return headers.reduce((obj, h, i) => {
                obj[h] = data[i];
                return obj;
            }, {});
        });
    }
};
