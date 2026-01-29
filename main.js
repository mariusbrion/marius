/**
 * main.js - Routeur et Orchestrateur Central
 * Gère l'état global et la navigation entre les modules.
 */

// Importation des modules (pattern named export)
import { CSVParser } from './modules/csv_parser.js';
import { Geocoder } from './modules/geocoder.js';
import { RouterAPI } from './modules/router_api.js';

const App = {
    // État persistant partagé entre les étapes
    appState: {
        currentStep: 'step-csv',
        rawData: null,
        coordinates: null,
        routes: null,
        settings: null
    },

    // Définition de l'ordre séquentiel des sections HTML
    stepsOrder: ['step-csv', 'step-geo', 'step-route', 'step-settings', 'step-map'],

    /**
     * Initialisation de l'application
     */
    init() {
        console.log("[App] Initialisation de l'orchestrateur...");
        
        // Initialisation des modules chargés
        CSVParser.init();
        Geocoder.init();
        RouterAPI.init();

        // Écoute de l'événement de navigation personnalisé émis par les modules
        window.addEventListener('nextStep', (event) => this.handleNavigation(event));
    },

    /**
     * Gestionnaire de navigation et de mise à jour d'état
     */
    handleNavigation(event) {
        const { data, next } = event.detail;

        console.log(`[App] Transition vers : ${next}`);

        // 1. Mise à jour de l'état atomique (Fusion des données entrantes)
        this.appState = { 
            ...this.appState, 
            ...data, 
            currentStep: next 
        };

        // 2. Logique métier spécifique au changement d'étape
        this.triggerModuleLogic(next);

        // 3. Mise à jour visuelle de l'interface
        this.updateUI(next);
    },

    /**
     * Déclenche la logique spécifique d'un module lors de l'entrée dans une section
     */
    triggerModuleLogic(stepId) {
        switch(stepId) {
            case 'step-geo':
                if (this.appState.rawData) {
                    Geocoder.startGeocoding(this.appState.rawData);
                }
                break;
            
            case 'step-route':
                if (this.appState.coordinates) {
                    RouterAPI.startRouting(this.appState.coordinates);
                }
                break;
        }
    },

    /**
     * Met à jour la visibilité des sections et la progression
     */
    updateUI(stepId) {
        document.querySelectorAll('.step-view').forEach(section => {
            section.classList.toggle('active', section.id === stepId);
        });

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

// Lancement de l'application
document.addEventListener('DOMContentLoaded', () => App.init());
