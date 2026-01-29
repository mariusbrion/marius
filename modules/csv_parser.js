/**
 * modules/csv_parser.js
 * Automatisation : Lance le traitement dès la sélection du fichier.
 */
export const CSVParser = {
    originalData: [],
    convertedData: [],
    fileName: '',

    init() {
        const fileInput = document.getElementById('csv-input');
        // On n'écoute plus le bouton "Lancer", mais directement le changement de l'input file
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
        }
    },

    handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.fileName = file.name;

        if (typeof Papa !== 'undefined') {
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                complete: (results) => {
                    this.originalData = results.data;
                    this.updateFileUI();
                    // AUTOMATISATION : On lance la conversion immédiatement après la lecture
                    this.processConversion();
                }
            });
        }
    },

    processConversion() {
        if (this.originalData.length < 2) return;
        const rows = this.originalData.slice(1);

        this.convertedData = rows.map(values => {
            const rue = (values[0] || '').trim();
            const ville = (values[1] || '').trim();
            const cp = (values[2] || '').trim();
            const rawSite = (values[3] || '').trim();

            const addrE = `${rue} ${ville} ${cp}`.trim();

            let addrS = rawSite;
            if (rawSite.includes(';')) {
                const parts = rawSite.split(';');
                addrS = parts.length === 2 ? `${parts[1].trim()} ${parts[0].trim()}` : rawSite.replace(/;/g, ' ');
            }

            return { 'adresse employé': addrE, 'adresse employeur': addrS };
        }).filter(row => row['adresse employé'] && row['adresse employeur']);

        // AUTOMATISATION : Envoi direct vers le géocodage
        window.dispatchEvent(new CustomEvent('nextStep', {
            detail: { data: { rawData: this.convertedData }, next: 'step-geo' }
        }));
    },

    updateFileUI() {
        const parseBtn = document.getElementById('btn-parse-csv');
        let infoBox = document.getElementById('csv-info-display');
        // On cache le bouton "Lancer" car il n'est plus nécessaire
        if (parseBtn) parseBtn.style.display = 'none';

        if (!infoBox && parseBtn) {
            infoBox = document.createElement('div');
            infoBox.id = 'csv-info-display';
            infoBox.className = "mt-4 mb-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm";
            parseBtn.parentNode.insertBefore(infoBox, parseBtn);
        }
        if (infoBox) infoBox.innerHTML = `<strong>${this.fileName}</strong> : Chargement et analyse automatique...`;
    }
};
