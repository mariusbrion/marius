/**
 * main.js - Orchestrateur Central
 * Gère le flux entre les modules et l'état de l'application.
 */

import { CSVParser } from './modules/csv_parser.js';
import { Geocoder } from './modules/geocoder.js';
import { RouterAPI } from './modules/router_api.js';
import { MapDisplay } from './modules/map_display.js';
import { Analytics } from './modules/analytics.js';

const App = {
    // État global de l'application centralisé
    appState: {
        currentStep: 'step-csv',
        rawData: null,
        coordinates: null,
        routes: null,
        isochrones: null
    },

    stepsOrder: ['step-csv', 'step-geo', 'step-route', 'step-map'],

    /**
     * Initialisation globale
     */
    init() {
        console.log("[App] Initialisation du système...");
        CSVParser.init();
        Geocoder.init();
        RouterAPI.init();
        
        // Écouteur pour le passage d'une étape à l'autre
        window.addEventListener('nextStep', (event) => this.handleNavigation(event));
    },

    /**
     * Gestion de la navigation et mise à jour de l'état
     */
    handleNavigation(event) {
        let { data, next } = event.detail;

        // Sécurité : redirection directe vers la carte si nécessaire
        if (next === 'step-settings') next = 'step-map';

        console.log(`[App] Transition vers : ${next}`);
        
        // Fusion de l'état actuel avec les nouvelles données
        this.appState = { ...this.appState, ...data, currentStep: next };

        this.triggerModuleLogic(next);
        this.updateUI(next);
    },

    /**
     * Déclenchement de la logique métier selon l'étape
     */
    triggerModuleLogic(stepId) {
        switch(stepId) {
            case 'step-geo':
                if (this.appState.rawData) Geocoder.startGeocoding(this.appState.rawData);
                break;
            case 'step-route':
                if (this.appState.coordinates) RouterAPI.startRouting(this.appState.coordinates);
                break;
            case 'step-map':
                if (this.appState.routes) {
                    // 1. Rendu de la carte Deck.gl
                    MapDisplay.render(this.appState);
                    // 2. Initialisation du Dashboard et des exports PDF
                    Analytics.init(this.appState);
                }
                break;
        }
    },

    /**
     * Mise à jour visuelle des sections et de la progression
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

document.addEventListener('DOMContentLoaded', () => App.init());
