/**
 * modules/csv_parser.js
 * Gère l'importation et la transformation des données CSV.
 * FIX : Utilisation des index de colonnes pour éviter les collisions de noms de colonnes.
 */

export const CSVParser = {
    originalData: [], // Contiendra un tableau de tableaux [ [col0, col1...], [...] ]
    convertedData: [],
    fileName: '',

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

    handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showError('Veuillez sélectionner un fichier CSV.');
            return;
        }

        this.fileName = file.name;
        this.readFile(file);
    },

    readFile(file) {
        // On force header: false pour récupérer les colonnes par index (0, 1, 2, 3)
        // car si deux colonnes s'appellent "commune", l'objet final est corrompu.
        if (typeof Papa !== 'undefined') {
            Papa.parse(file, {
                header: false, 
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: (results) => {
                    this.originalData = results.data;
                    this.updateFileUI();
                },
                error: (err) => this.showError(`Erreur de lecture : ${err.message}`)
            });
        } else {
            // Fallback manuel si PapaParse est absent
            const reader = new FileReader();
            reader.onload = (e) => {
                this.originalData = this.simpleCSVParse(e.target.result);
                this.updateFileUI();
            };
            reader.readAsText(file);
        }
    },

    processConversion() {
        if (this.originalData.length < 2) {
            this.showError('Le fichier est vide ou contient trop peu de lignes.');
            return;
        }

        try {
            // On saute la première ligne (les en-têtes)
            const rows = this.originalData.slice(1);

            this.convertedData = rows.map((values) => {
                // Extraction sécurisée par index selon votre structure :
                // 0: Rue, 1: Commune, 2: CP, 3: Site employeur (ou 2ème commune)
                let rue = (values[0] || '').toString().trim();
                let commune = (values[1] || '').toString().trim();
                let cp = (values[2] || '').toString().trim();
                let site = (values[3] || '').toString().trim();

                // Construction propre de l'adresse employé (Format : Rue, Ville)
                // Inverser par rapport à votre code original pour favoriser la BAN (Rue Ville)
                let addrE = rue && commune ? `${rue} ${commune}` : (rue || commune || '');
                if (cp && addrE) addrE += ` ${cp}`;
                
                // L'adresse employeur (le site de travail)
                let addrSite = site;

                return { 
                    'adresse employé': addrE, 
                    'adresse employeur': addrSite 
                };
            }).filter(row => row['adresse employé'] !== '' && row['adresse employeur'] !== '');

            if (this.convertedData.length === 0) {
                throw new Error("Aucune donnée valide n'a pu être extraite.");
            }

            this.emitNextStep();
        } catch (error) {
            this.showError(`Erreur de conversion : ${error.message}`);
        }
    },

    emitNextStep() {
        const event = new CustomEvent('nextStep', {
            detail: {
                data: { rawData: this.convertedData },
                next: 'step-geo'
            }
        });
        window.dispatchEvent(event);
    },

    updateFileUI() {
        const parseBtn = document.getElementById('btn-parse-csv');
        let infoBox = document.getElementById('csv-info-display');
        
        if (!infoBox && parseBtn) {
            infoBox = document.createElement('div');
            infoBox.id = 'csv-info-display';
            infoBox.className = "mt-4 mb-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-left";
            parseBtn.parentNode.insertBefore(infoBox, parseBtn);
        }

        if (infoBox) {
            const count = Math.max(0, this.originalData.length - 1);
            infoBox.innerHTML = `
                <div class="flex items-center space-x-2 text-indigo-700">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"></path></svg>
                    <span class="font-bold">${this.fileName}</span>
                </div>
                <p class="text-slate-500 mt-1">${count} paires d'adresses détectées.</p>
            `;
        }
    },

    showError(message) {
        this.updateFileUI();
        const infoBox = document.getElementById('csv-info-display');
        if (infoBox) {
            infoBox.className = "mt-4 mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium";
            infoBox.innerText = `⚠️ ${message}`;
        }
    },

    simpleCSVParse(text) {
        const lines = text.split('\n').filter(l => l.trim() !== '');
        const delimiter = lines[0].includes(';') ? ';' : ',';
        return lines.map(line => line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, '')));
    }
};
