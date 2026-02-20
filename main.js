/**
 * main.js - Orchestrateur Central de CartoProcessor Pro
 * Gère le flux de données entre l'import CSV, le géocodage,
 * le routage et l'affichage final (Carte + Analytics).
 */

import { CSVParser } from './modules/csv_parser.js';
import { Geocoder } from './modules/geocoder.js';
import { RouterAPI } from './modules/router_api.js';
import { MapDisplay } from './modules/map_display.js';
import { Analytics } from './modules/analytics.js';

const App = {
    /**
     * État global de l'application
     */
    appState: {
        currentStep: 'step-csv',
        rawData: null,      // Données brutes issues du CSV
        coordinates: null,  // Adresses converties en lat/lon
        routes: null,       // Itinéraires et isochrones calculés
        isochrones: null    // Stockage spécifique des polygones isochrones
    },

    // Définition de l'ordre séquentiel des vues
    stepsOrder: ['step-csv', 'step-geo', 'step-route', 'step-map'],

    /**
     * Point d'entrée de l'application
     */
    init() {
        console.log("[App] Initialisation de l'orchestrateur...");

        // Initialisation des modules qui nécessitent des écouteurs d'événements DOM immédiats
        CSVParser.init();
        Geocoder.init();
        RouterAPI.init();

        // Écouteur global pour la navigation entre les étapes
        window.addEventListener('nextStep', (event) => this.handleNavigation(event));
    },

    /**
     * Gère la transition vers l'étape suivante et la mise à jour de l'état
     * @param {CustomEvent} event - Contient 'data' (nouveaux résultats) et 'next' (id de la section)
     */
    handleNavigation(event) {
        let { data, next } = event.detail;

        // Sécurité : redirection automatique si un ancien module pointe vers les réglages
        if (next === 'step-settings') next = 'step-map';

        console.log(`[App] Transition vers : ${next}`);

        // Mise à jour de l'état avec les nouvelles données reçues
        this.appState = { 
            ...this.appState, 
            ...data, 
            currentStep: next 
        };

        // Exécution de la logique métier spécifique au module de destination
        this.triggerModuleLogic(next);

        // Mise à jour visuelle de l'interface
        this.updateUI(next);
    },

    /**
     * Déclenche les fonctions principales des modules selon l'étape
     * @param {string} stepId - L'identifiant de la section active
     */
    triggerModuleLogic(stepId) {
        switch(stepId) {
            case 'step-geo':
                // Lance le géocodage dès réception des données CSV
                if (this.appState.rawData) {
                    Geocoder.startGeocoding(this.appState.rawData);
                }
                break;

            case 'step-route':
                // Lance le calcul d'itinéraires après le géocodage
                if (this.appState.coordinates) {
                    RouterAPI.startRouting(this.appState.coordinates);
                }
                break;

            case 'step-map':
                // Étape finale : Rendu de la carte et du dashboard analytique
                if (this.appState.routes) {
                    // 1. Affiche la carte interactive
                    MapDisplay.render(this.appState);
                    
                    // 2. Initialise les graphiques et le système d'audit PDF
                    Analytics.init(this.appState);
                }
                break;
        }
    },

    /**
     * Met à jour la barre de progression et la visibilité des sections HTML
     * @param {string} stepId 
     */
    updateUI(stepId) {
        // Bascule de la classe 'active' pour afficher la bonne section
        document.querySelectorAll('.step-view').forEach(section => {
            section.classList.toggle('active', section.id === stepId);
        });

        // Mise à jour de la barre de progression principale
        const index = this.stepsOrder.indexOf(stepId);
        if (index !== -1) {
            const progress = ((index + 1) / this.stepsOrder.length) * 100;
            const bar = document.getElementById('progress-bar');
            const indicator = document.getElementById('step-indicator');
            
            if (bar) bar.style.width = `${progress}%`;
            if (indicator) {
                indicator.innerText = `Étape ${index + 1} sur ${this.stepsOrder.length}`;
            }
        }

        // Retour automatique en haut de page pour la nouvelle étape
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

// Démarrage de l'application une fois le DOM chargé
document.addEventListener('DOMContentLoaded', () => App.init());
