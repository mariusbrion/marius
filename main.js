/**
 * main.js - Routeur et Orchestrateur Central
 * Gère l'état global et la navigation entre les modules.
 */

// Importation des modules (pattern named export)
import { CSVParser } from './modules/csv_parser.js';
import { Geocoder } from './modules/geocoder.js';
// Note: Les imports suivants seront à créer sur le même modèle
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
        
        // Initialisation des modules
        CSVParser.init();
        Geocoder.init();

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

        // 1. Mise à jour de l'état atomique (Fusion)
        this.appState = { 
            ...this.appState, 
            ...data, 
            currentStep: next 
        };

        // 2. Logique de routage (chargement des modules cibles)
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
                // On lance automatiquement le géocodage avec les données du CSV
                if (this.appState.rawData) {
                    Geocoder.startGeocoding(this.appState.rawData);
                }
                break;
            
            case 'step-route':
                // Initialiser le module de routage ici
                const log = document.getElementById('route-logs');
                if(log) log.innerHTML += `<br>> Données reçues : ${this.appState.coordinates?.length || 0} points géocodés.`;
                break;
                
            case 'step-map':
                // MapDisplay.render(this.appState);
                break;
        }
    },

    /**
     * Mise à jour de la visibilité des sections et de la barre de progression
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

// Lancement sécurisé
document.addEventListener('DOMContentLoaded', () => App.init());
