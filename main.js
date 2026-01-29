/**
 * main.js - Routeur et Orchestrateur Central
 * Gère l'état global et la navigation entre les modules.
 * Version : Full Auto (CSV -> Geo -> Route -> Map)
 */

import { CSVParser } from './modules/csv_parser.js';
import { Geocoder } from './modules/geocoder.js';
import { RouterAPI } from './modules/router_api.js';
import { MapDisplay } from './modules/map_display.js';

const App = {
    // État persistant partagé
    appState: {
        currentStep: 'step-csv',
        rawData: null,
        coordinates: null,
        routes: null
    },

    // Ordre simplifié : l'étape 'step-settings' est supprimée
    stepsOrder: ['step-csv', 'step-geo', 'step-route', 'step-map'],

    /**
     * Initialisation de l'application
     */
    init() {
        console.log("[App] Initialisation de l'orchestrateur...");
        
        // Initialisation des modules
        CSVParser.init();
        Geocoder.init();
        RouterAPI.init();
        // MapDisplay est passif, il attend l'appel de rendu

        // Écoute de l'événement de navigation personnalisé
        window.addEventListener('nextStep', (event) => this.handleNavigation(event));
    },

    /**
     * Gestionnaire de navigation et de mise à jour d'état
     */
    handleNavigation(event) {
        let { data, next } = event.detail;

        // REDIRECTION AUTOMATIQUE : 
        // Si un module demande 'step-settings' (ancienne version), on redirige vers 'step-map'
        if (next === 'step-settings') {
            next = 'step-map';
        }

        console.log(`[App] Transition vers : ${next}`);

        // 1. Fusion des données dans l'état global
        this.appState = { 
            ...this.appState, 
            ...data, 
            currentStep: next 
        };

        // 2. Déclenchement de la logique du module cible
        this.triggerModuleLogic(next);

        // 3. Mise à jour visuelle (Sections et Barre de progression)
        this.updateUI(next);
    },

    /**
     * Déclenche la logique spécifique d'un module
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
                
            case 'step-map':
                // Appel au module de rendu Deck.gl pour afficher la Heatmap
                if (this.appState.coordinates && this.appState.routes) {
                    MapDisplay.render(this.appState);
                } else {
                    console.error("[App] Données insuffisantes pour afficher la carte.");
                }
                break;
        }
    },

    /**
     * Mise à jour de l'interface utilisateur
     */
    updateUI(stepId) {
        // Affichage de la section correspondante
        document.querySelectorAll('.step-view').forEach(section => {
            section.classList.toggle('active', section.id === stepId);
        });

        // Mise à jour de la barre de progression globale
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

// Démarrage
document.addEventListener('DOMContentLoaded', () => App.init());
