/**
 * main.js - Routeur et Orchestrateur Central
 * Version synchronisée avec le flux automatique à 4 étapes.
 */

import { CSVParser } from './modules/csv_parser.js';
import { Geocoder } from './modules/geocoder.js';
import { RouterAPI } from './modules/router_api.js';
import { MapDisplay } from './modules/map_display.js';

const App = {
    appState: {
        currentStep: 'step-csv',
        rawData: null,
        coordinates: null,
        routes: null
    },

    // 4 étapes majeures désormais
    stepsOrder: ['step-csv', 'step-geo', 'step-route', 'step-map'],

    init() {
        console.log("[App] Orchestrateur prêt.");
        CSVParser.init();
        Geocoder.init();
        RouterAPI.init();
        window.addEventListener('nextStep', (event) => this.handleNavigation(event));
    },

    handleNavigation(event) {
        let { data, next } = event.detail;

        // Redirection de sécurité (si un module envoie encore vers step-settings)
        if (next === 'step-settings') next = 'step-map';

        console.log(`[App] Migration vers : ${next}`);

        this.appState = { ...this.appState, ...data, currentStep: next };

        this.triggerModuleLogic(next);
        this.updateUI(next);
    },

    triggerModuleLogic(stepId) {
        switch(stepId) {
            case 'step-geo':
                if (this.appState.rawData) Geocoder.startGeocoding(this.appState.rawData);
                break;
            case 'step-route':
                if (this.appState.coordinates) RouterAPI.startRouting(this.appState.coordinates);
                break;
            case 'step-map':
                if (this.appState.routes) MapDisplay.render(this.appState);
                break;
        }
    },

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
