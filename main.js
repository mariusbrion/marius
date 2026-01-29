/**
 * main.js - Routeur et Orchestrateur Central
 * Gère l'état global et la navigation entre les modules.
 */

// Importation des modules (pattern named export)
import { CSVParser } from './modules/csv_parser.js';
// Note: Les imports suivants supposent que vous créerez ces fichiers sur le même modèle
// import { Geocoder } from './modules/geocoder.js';
// import { RouterAPI } from './modules/router_api.js';
// import { Settings } from './modules/settings.js';
// import { MapDisplay } from './modules/map_display.js';

const App = {
    // État persistant partagé entre les étapes
    appState: {
        currentStep: 'step-csv',
        rawData: null,
        coordinates: null,
        routes: null,
        settings: null
    },

    // Définition de l'ordre séquentiel
    stepsOrder: ['step-csv', 'step-geo', 'step-route', 'step-settings', 'step-map'],

    /**
     * Initialisation de l'application
     */
    init() {
        console.log("[App] Initialisation de l'orchestrateur...");
        
        // Initialisation du premier module
        CSVParser.init();

        // Écoute de l'événement de navigation personnalisé
        window.addEventListener('nextStep', (event) => this.handleNavigation(event));
    },

    /**
     * Gestionnaire de navigation et de mise à jour d'état
     * @param {CustomEvent} event - Contient detail.data et detail.next
     */
    handleNavigation(event) {
        const { data, next } = event.detail;

        console.log(`[App] Transition vers : ${next}`);

        // 1. Mise à jour de l'état atomique
        this.appState = { 
            ...this.appState, 
            ...data, 
            currentStep: next 
        };

        // 2. Logique de routage (chargement des modules cibles si besoin)
        this.triggerModuleLogic(next);

        // 3. Mise à jour visuelle de l'interface
        this.updateUI(next);
    },

    /**
     * Déclenche la logique spécifique d'un module lors de l'entrée dans une section
     */
    triggerModuleLogic(stepId) {
        // Exemple de couplage faible pour les modules dépendants de l'état
        if (stepId === 'step-geo') {
            // Geocoder.process(this.appState.rawData);
            const log = document.getElementById('geo-log');
            if(log) log.innerText = `Données reçues pour géocodage : ${this.appState.rawData?.length || 0} lignes.`;
        }
        
        if (stepId === 'step-map') {
            // MapDisplay.render(this.appState);
        }
    },

    /**
     * Mise à jour de la visibilité des sections et de la barre de progression
     */
    updateUI(stepId) {
        // Changement de vue
        document.querySelectorAll('.step-view').forEach(section => {
            section.classList.toggle('active', section.id === stepId);
        });

        // Mise à jour de la barre de progression
        const index = this.stepsOrder.indexOf(stepId);
        if (index !== -1) {
            const progress = ((index + 1) / this.stepsOrder.length) * 100;
            const bar = document.getElementById('progress-bar');
            const indicator = document.getElementById('step-indicator');
            
            if (bar) bar.style.width = `${progress}%`;
            if (indicator) indicator.innerText = `Étape ${index + 1} sur ${this.stepsOrder.length}`;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

// Lancement sécurisé
document.addEventListener('DOMContentLoaded', () => App.init());
