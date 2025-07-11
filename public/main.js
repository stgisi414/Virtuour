// --- 1. API CONFIGURATION ---
const API_BASE_URL = window.location.origin;

// --- 2. DOM ELEMENT REFERENCES ---
const destinationInput = document.getElementById('destinationInput');
const tourFocus = document.getElementById('tourFocus');
const generateTourButton = document.getElementById('generateTourButton');
const tourSetupContainer = document.getElementById('tour-setup');
const streetviewContainer = document.getElementById('streetview-container');
const tourInfoContainer = document.getElementById('tour-information');
const subtitlesContainer = document.getElementById('subtitles-container');
const loadingIndicator = document.getElementById('loading-indicator');
const loadingText = document.getElementById('loading-text');
const galleryContainer = document.getElementById('gallery-container');
const galleryTitle = document.getElementById('gallery-title');
const galleryGrid = document.getElementById('gallery-grid');
const endTourButton = document.getElementById('endTourButton');
const localTime = document.getElementById('local-time');
const localWeather = document.getElementById('local-weather');
const localNews = document.getElementById('local-news');
const addressLabel = document.getElementById('address-label');
const currentAddress = document.getElementById('current-address');
const controlsContainer = document.getElementById('controls-container');
const pauseTourButton = document.getElementById('pauseTourButton');
const pauseIcon = document.getElementById('pause-icon');
const pauseText = document.getElementById('pause-text');
const exploreButton = document.getElementById('exploreButton');
const returnToTourButton = document.getElementById('returnToTourButton');
const musicButton = document.getElementById('music-button');
const musicIcon = document.getElementById('music-icon');

// --- 3. GLOBAL VARIABLES ---
let streetView;
let geocoder;
let streetViewService;
let tourItinerary = [];
let currentStopIndex = 0;
let currentDestination = '';
let localTimeInterval = null;
let destinationTimezone = null;
let currentAudio = null;
let exploreLocation = null;
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

// --- 4. TOUR STATE MACHINE ---
class TourStateMachine {
    constructor() {
        this.state = 'setup';
        this.isRunning = false;
        this.isPaused = false;
        this.isExploring = false;
        this.currentTimeout = null;
        this.listeners = new Map();
    }

    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        console.log(`State changed: ${oldState} -> ${newState}`);
        this.emit('stateChange', { from: oldState, to: newState });
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    start() {
        this.isRunning = true;
        this.isPaused = false;
        this.setState('touring');
    }

    pause() {
        this.isPaused = true;
        this.setState('paused');
        this.clearTimeouts();
    }

    resume() {
        this.isPaused = false;
        this.setState('touring');
    }

    stop() {
        this.isRunning = false;
        this.isPaused = false;
        this.setState('stopped');
        this.clearTimeouts();
    }

    explore() {
        this.isExploring = true;
        this.setState('exploring');
    }

    endExploring() {
        this.isExploring = false;
        this.setState(this.isPaused ? 'paused' : 'touring');
    }

    complete() {
        this.isRunning = false;
        this.setState('gallery');
        this.clearTimeouts();
    }

    reset() {
        this.stop();
        this.setState('setup');
    }

    clearTimeouts() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
    }

    setTimeout(callback, delay) {
        this.clearTimeouts();
        this.currentTimeout = setTimeout(() => {
            this.currentTimeout = null;
            callback();
        }, delay);
    }
}

const tourState = new TourStateMachine();

// --- 5. UTILITY FUNCTIONS ---
function showToast(text, type = 'info') {
    let backgroundColor;
    switch (type) {
        case 'error':
            backgroundColor = "linear-gradient(to right, #ef4444, #b91c1c)";
            break;
        case 'success':
            backgroundColor = "linear-gradient(to right, #22c55e, #15803d)";
            break;
        default:
            backgroundColor = "linear-gradient(to right, #0ea5e9, #0284c7)";
            break;
    }
    Toastify({
        text: text,
        duration: 5000,
        close: true,
        gravity: "top",
        position: "center",
        stopOnFocus: true,
        style: {
            background: backgroundColor,
            borderRadius: "0.5rem",
            boxShadow: "0 3px 6px -1px rgba(0, 0, 0, 0.12), 0 10px 36px -4px rgba(0, 0, 0, 0.3)",
            fontFamily: "'Exo 2', sans-serif",
            zIndex: "9999",
            position: "fixed",
            top: "20px"
        },
    }).showToast();
}

function toggleVisibility(element, show) {
    if (show) {
        element.classList.remove('invisible', 'opacity-0');
    } else {
        element.classList.add('invisible', 'opacity-0');
    }
}

function setLoading(isLoading, message = '') {
    loadingText.textContent = message;
    toggleVisibility(loadingIndicator, isLoading);
}

function updateAddressLabel(locationName) {
    currentAddress.textContent = locationName;
    toggleVisibility(addressLabel, true);
}

function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    tourState.clearTimeouts();
}

// --- 6. INITIALIZATION ---
function initializeTourApp() {
    try {
        streetView = new google.maps.StreetViewPanorama(streetviewContainer, {
            position: { lat: 40.7291, lng: -73.9965 },
            pov: { heading: 165, pitch: 0 },
            zoom: 1,
            visible: false,
            addressControl: false,
            linksControl: true,
            fullscreenControl: false,
            enableCloseButton: false,
            motionTracking: false,
            motionTrackingControl: false,
        });

        geocoder = new google.maps.Geocoder();
        streetViewService = new google.maps.StreetViewService();
        locationProcessor = new LocationProcessor(geocoder, streetViewService);

        generateTourButton.disabled = false;
        generateTourButton.textContent = 'Generate Tour';

        setupStateMachineListeners();

        console.log('Tour app initialized successfully');
    } catch (error) {
        console.error('Initialization failed:', error);
        showToast('Failed to initialize Google Maps. Please refresh the page.', 'error');
    }
}

// Make it available globally for Google Maps callback
window.initializeTourApp = initializeTourApp;

function setupStateMachineListeners() {
    tourState.on('stateChange', ({ from, to }) => {
        updateUIForState(to);
    });
}

function updateUIForState(state) {
    switch (state) {
        case 'setup':
            resetUI();
            break;
        case 'touring':
            updateControlsForTouring();
            break;
        case 'paused':
            updateControlsForPaused();
            break;
        case 'exploring':
            updateControlsForExploring();
            break;
        case 'gallery':
            hideAllTourUI();
            break;
    }
}

// --- 7. OPTIMIZED LOCATION PROCESSING ---
class LocationProcessor {
    constructor(geocoder, streetViewService) {
        this.geocoder = geocoder;
        this.streetViewService = streetViewService;
        this.cache = new Map();
    }

    async processLocation(locationName, cityName) {
        const cacheKey = `${locationName}_${cityName}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const result = await this._findOptimalLocation(locationName, cityName);
            this.cache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.error(`Failed to process ${locationName}:`, error);
            throw error;
        }
    }

    async _findOptimalLocation(locationName, cityName) {
        // Step 1: Get multiple geocoding candidates
        const candidates = await this._getGeocodingCandidates(locationName, cityName);

        if (candidates.length === 0) {
            throw new Error(`No geocoding results for ${locationName}`);
        }

        // Step 2: Find the best candidate with Street View
        for (const candidate of candidates) {
            const streetViewResult = await this._findNearestStreetView(candidate);

            if (streetViewResult.hasStreetView) {
                return {
                    locationName,
                    coordinates: candidate,
                    streetViewCoordinates: streetViewResult,
                    placeId: candidate.placeId,
                    panoId: streetViewResult.panoId,
                    hasStreetView: true,
                    formattedAddress: candidate.formattedAddress
                };
            }
        }

        // Step 3: Fallback to first candidate without Street View
        const fallback = candidates[0];
        return {
            locationName,
            coordinates: fallback,
            streetViewCoordinates: fallback,
            placeId: fallback.placeId,
            panoId: null,
            hasStreetView: false,
            formattedAddress: fallback.formattedAddress
        };
    }

    async _getGeocodingCandidates(locationName, cityName) {
        const queries = [
            `${locationName}, ${cityName}`,
            `${locationName}`,
            `${locationName} ${cityName}`,
            `${locationName} landmark ${cityName}`
        ];

        const candidates = [];

        for (const query of queries) {
            try {
                const results = await this._geocodeQuery(query);
                candidates.push(...results);

                if (candidates.length >= 3) break;
            } catch (error) {
                console.warn(`Geocoding failed for "${query}":`, error.message);
            }
        }

        return this._deduplicateAndSort(candidates, cityName);
    }

    async _geocodeQuery(query) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Geocoding timeout'));
            }, 8000);

            this.geocoder.geocode(
                { 
                    address: query,
                    region: 'global'
                }, 
                (results, status) => {
                    clearTimeout(timeoutId);

                    if (status === 'OK' && results?.length > 0) {
                        const candidates = results.slice(0, 3).map(result => ({
                            lat: result.geometry.location.lat(),
                            lng: result.geometry.location.lng(),
                            placeId: result.place_id,
                            formattedAddress: result.formatted_address,
                            types: result.types || [],
                            accuracy: this._calculateAccuracy(result)
                        }));
                        resolve(candidates);
                    } else {
                        reject(new Error(`Geocoding failed: ${status}`));
                    }
                }
            );
        });
    }

    async _findNearestStreetView(coordinates) {
        const position = new google.maps.LatLng(coordinates.lat, coordinates.lng);
        const searchRadii = [50, 100, 200, 500];

        for (const radius of searchRadii) {
            try {
                const result = await this._searchStreetViewWithRadius(position, radius);
                if (result.hasStreetView) {
                    return result;
                }
            } catch (error) {
                console.warn(`Street View search failed at radius ${radius}:`, error.message);
            }
        }

        return {
            lat: coordinates.lat,
            lng: coordinates.lng,
            panoId: null,
            hasStreetView: false
        };
    }

    async _searchStreetViewWithRadius(position, radius) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Street View timeout'));
            }, 6000);

            this.streetViewService.getPanorama({
                location: position,
                radius: radius,
                source: google.maps.StreetViewSource.OUTDOOR,
                preference: google.maps.StreetViewPreference.NEAREST
            }, (data, status) => {
                clearTimeout(timeoutId);

                if (status === 'OK' && data?.location) {
                    resolve({
                        lat: data.location.latLng.lat(),
                        lng: data.location.latLng.lng(),
                        panoId: data.location.pano,
                        hasStreetView: true,
                        radius: radius
                    });
                } else {
                    resolve({
                        lat: position.lat(),
                        lng: position.lng(),
                        panoId: null,
                        hasStreetView: false
                    });
                }
            });
        });
    }

    _calculateAccuracy(result) {
        let score = 0;

        const highValueTypes = ['tourist_attraction', 'museum', 'park', 'landmark', 'establishment'];
        const mediumValueTypes = ['point_of_interest', 'premise'];

        if (result.types.some(type => highValueTypes.includes(type))) score += 10;
        else if (result.types.some(type => mediumValueTypes.includes(type))) score += 5;

        if (result.geometry.location_type === 'ROOFTOP') score += 8;
        else if (result.geometry.location_type === 'RANGE_INTERPOLATED') score += 5;
        else if (result.geometry.location_type === 'GEOMETRIC_CENTER') score += 3;

        return score;
    }

    _deduplicateAndSort(candidates, cityName) {
        const unique = [];
        const threshold = 0.001;

        for (const candidate of candidates) {
            const isDuplicate = unique.some(existing => 
                Math.abs(existing.lat - candidate.lat) < threshold &&
                Math.abs(existing.lng - candidate.lng) < threshold
            );

            if (!isDuplicate) {
                if (candidate.formattedAddress.toLowerCase().includes(cityName.toLowerCase())) {
                    candidate.accuracy += 5;
                }
                unique.push(candidate);
            }
        }

        return unique.sort((a, b) => b.accuracy - a.accuracy);
    }

    clearCache() {
        this.cache.clear();
    }
}

let locationProcessor;

// --- 8. TOUR GENERATION ---
async function generateTour() {
    const userInput = destinationInput.value.trim();
    const selectedFocus = tourFocus.value;

    if (!userInput) {
        showToast('Please enter a destination city.', 'error');
        return;
    }

    // Get the properly formatted destination name
    currentDestination = await getProperDestinationName(userInput);

    resetTourState();
    toggleVisibility(tourSetupContainer, false);

    try {
        setLoading(true, `Creating ${selectedFocus} tour for ${currentDestination}...`);

        const rawItinerary = await fetchItinerary(currentDestination, selectedFocus);

        if (!rawItinerary || rawItinerary.length === 0) {
            throw new Error('Failed to generate tour itinerary');
        }

        setLoading(true, 'Processing locations...');
        tourItinerary = await processItinerary(rawItinerary, currentDestination);

        if (tourItinerary.length === 0) {
            throw new Error('No valid locations found for this tour');
        }

        console.log(`Successfully processed ${tourItinerary.length} locations`);

        await initializeTourUI();
        
        // Generate regional music for the destination
        generateRegionalMusic(currentDestination).then(success => {
            if (success) {
                showToast('Regional music ready! Click the music button to play.', 'success');
            }
        });
        
        setLoading(false);
        startTourSequence();

    } catch (error) {
        console.error('Error generating tour:', error);
        showToast(`Failed to generate tour: ${error.message}`, 'error');
        resetToMainMenu();
    }
}

async function processItinerary(rawItinerary, cityName) {
    const processedStops = [];
    const batchSize = 2;

    for (let i = 0; i < rawItinerary.length; i += batchSize) {
        const batch = rawItinerary.slice(i, i + batchSize);
        const batchPromises = batch.map(async (stop, batchIndex) => {
            const globalIndex = i + batchIndex;
            setLoading(true, `Processing ${globalIndex + 1}/${rawItinerary.length}: ${stop.locationName}...`);

            try {
                const locationData = await locationProcessor.processLocation(stop.locationName, cityName);

                return {
                    ...locationData,
                    briefDescription: stop.briefDescription
                };
            } catch (error) {
                console.warn(`✗ Failed: ${stop.locationName} - ${error.message}`);
                return null;
            }
        });

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, batchIndex) => {
            if (result.status === 'fulfilled' && result.value) {
                processedStops.push(result.value);
                console.log(`✓ Processed: ${result.value.locationName}`);
            }
        });

        if (i + batchSize < rawItinerary.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return processedStops;
}

// --- 9. TOUR EXECUTION WITH STATE MACHINE ---
function startTourSequence() {
    currentStopIndex = 0;
    tourState.start();

    moveToLocation(tourItinerary[0])
        .then(() => {
            presentCurrentLocation();
        })
        .catch(error => {
            console.error('Failed to start tour:', error);
            showToast('Failed to start tour', 'error');
            resetToMainMenu();
        });
}

async function moveToLocation(stop) {
    try {
        console.log(`Moving to: ${stop.locationName}${stop.hasStreetView ? ' (Street View)' : ' (Satellite)'}`);

        if (stop.hasStreetView && stop.panoId) {
            streetView.setPano(stop.panoId);
            streetView.setPov({ 
                heading: 0, 
                pitch: 5,
                zoom: 1 
            });
        } else {
            const position = new google.maps.LatLng(
                stop.streetViewCoordinates.lat, 
                stop.streetViewCoordinates.lng
            );
            streetView.setPosition(position);
            streetView.setPov({ 
                heading: 0, 
                pitch: 0, 
                zoom: 1 
            });
        }

        updateAddressLabel(stop.formattedAddress || stop.locationName);

        setTimeout(() => {
            const currentPos = streetView.getPosition();
            if (currentPos) {
                console.log(`✓ Positioned at: ${currentPos.lat().toFixed(6)}, ${currentPos.lng().toFixed(6)}`);
            }
        }, 1000);

    } catch (error) {
        console.error(`Error moving to ${stop.locationName}:`, error);
        throw error;
    }
}

function presentCurrentLocation() {
    if (currentStopIndex >= tourItinerary.length) return;

    const location = tourItinerary[currentStopIndex];
    stopAudio();

    const subtitle = `${location.locationName}: ${location.briefDescription}`;
    subtitlesContainer.textContent = subtitle;
    toggleVisibility(tourInfoContainer, true);

    tourState.pause();

    playLocationNarration(location);
}

async function playLocationNarration(location) {
    try {
        const text = `Welcome to ${location.locationName}. ${location.briefDescription}. You can explore this area or continue to the next location.`;

        const audioResponse = await fetch(`${API_BASE_URL}/api/generate-speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                language: 'en',
                languageRegion: 'US'
            })
        });

        if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            currentAudio = new Audio(audioUrl);
            currentAudio.onended = () => {
                toggleVisibility(tourInfoContainer, false);
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
            };

            currentAudio.onerror = () => {
                console.warn('Audio playback failed, falling back to text display');
                toggleVisibility(tourInfoContainer, false);
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
            };

            currentAudio.play();

            tourState.setTimeout(() => {
                if (currentAudio) {
                    currentAudio.pause();
                    toggleVisibility(tourInfoContainer, false);
                    currentAudio = null;
                }
            }, 20000);
        } else {
            console.warn('TTS failed, showing text only');
            tourState.setTimeout(() => {
                toggleVisibility(tourInfoContainer, false);
            }, 8000);
        }

    } catch (error) {
        console.error('Error with TTS:', error);
        tourState.setTimeout(() => {
            toggleVisibility(tourInfoContainer, false);
        }, 8000);
    }
}

function continueToNextLocation() {
    if (currentStopIndex >= tourItinerary.length - 1) {
        completeTour();
        return;
    }

    const nextIndex = currentStopIndex + 1;
    const nextLocation = tourItinerary[nextIndex];

    setLoading(true, `Traveling to ${nextLocation.locationName}...`);

    const transition = createSmoothTransition(
        tourItinerary[currentStopIndex],
        nextLocation,
        () => {
            setLoading(false);
            currentStopIndex = nextIndex;
            presentCurrentLocation();
        }
    );

    transition.start();
}

function createSmoothTransition(fromStop, toStop, onComplete) {
    const fromPos = fromStop.streetViewCoordinates;
    const toPos = toStop.streetViewCoordinates;
    const duration = 2000;
    const startTime = Date.now();

    return {
        start() {
            const animate = () => {
                if (!tourState.isRunning) {
                    onComplete();
                    return;
                }

                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = easeInOutCubic(progress);

                const lat = fromPos.lat + (toPos.lat - fromPos.lat) * eased;
                const lng = fromPos.lng + (toPos.lng - fromPos.lng) * eased;

                streetView.setPosition(new google.maps.LatLng(lat, lng));

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    moveToLocation(toStop)
                        .then(onComplete)
                        .catch(onComplete);
                }
            };

            requestAnimationFrame(animate);
        }
    };
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

// --- 10. UI CONTROL FUNCTIONS ---
async function initializeTourUI() {
    toggleVisibility(streetviewContainer, true);
    streetView.setVisible(true);
    toggleVisibility(controlsContainer, true);
    positionControls();
    updateControlsForPaused();
    console.log('Tour UI initialized');
}

function updateControlsForTouring() {
    areaChatButton.style.display = 'none';
    musicButton.style.display = 'none';
    exploreButton.style.display = 'none';
    returnToTourButton.style.display = 'none';
    pauseTourButton.style.display = 'flex';

    pauseIcon.textContent = '⏸️';
    pauseText.textContent = 'Pause Tour';
    pauseTourButton.className = 'bg-red-500 hover:bg-red-400 text-white font-bold p-3 sm:py-2 sm:px-4 rounded-lg shadow-lg border border-red-400 transition-colors duration-300 flex items-center gap-2 min-w-[48px]';
}

function updateControlsForPaused() {
    areaChatButton.style.display = 'flex';
    musicButton.style.display = 'flex';
    exploreButton.style.display = 'flex';
    returnToTourButton.style.display = 'none';
    pauseTourButton.style.display = 'flex';

    if (currentStopIndex >= tourItinerary.length - 1) {
        pauseIcon.textContent = '🏁';
        pauseText.textContent = 'End Tour';
        pauseTourButton.className = 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold p-3 sm:py-2 sm:px-4 rounded-lg shadow-lg border border-cyan-400 transition-colors duration-300 flex items-center gap-2 min-w-[48px]';
    } else {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Continue';
        pauseTourButton.className = 'bg-green-500 hover:bg-green-400 text-white font-bold p-3 sm:py-2 sm:px-4 rounded-lg shadow-lg border border-green-400 transition-colors duration-300 flex items-center gap-2 min-w-[48px]';
    }
}

function updateControlsForExploring() {
    areaChatButton.style.display = 'none';
    musicButton.style.display = 'flex';
    exploreButton.style.display = 'none';
    returnToTourButton.style.display = 'flex';
    pauseTourButton.style.display = 'none';
}

// --- 11. TOUR CONTROLS ---
function togglePause() {
    if (tourState.state === 'paused') {
        if (currentStopIndex >= tourItinerary.length - 1) {
            completeTour();
        } else {
            tourState.resume();
            continueToNextLocation();
        }
    } else if (tourState.state === 'touring') {
        tourState.pause();
    }
}

async function exploreCurrentLocation() {
    if (tourState.state !== 'paused' || currentStopIndex >= tourItinerary.length) return;

    const currentStop = tourItinerary[currentStopIndex];
    tourState.explore();
    exploreLocation = streetView.getPosition();

    setLoading(true, `Exploring ${currentStop.locationName}...`);

    try {
        const randomPanorama = await findRandomPanoramaInArea(currentStop);

        if (randomPanorama && randomPanorama.panoId) {
            streetView.setPano(randomPanorama.panoId);
            streetView.setPov({
                heading: Math.random() * 360,
                pitch: Math.random() * 30 - 10,
                zoom: 1
            });
            showToast(`Found a different spot in ${currentStop.locationName}!`, 'success');
        } else {
            const fallbackPanorama = await findNearbyPanorama(currentStop, 300);
            if (fallbackPanorama && fallbackPanorama.panoId) {
                streetView.setPano(fallbackPanorama.panoId);
                streetView.setPov({
                    heading: Math.random() * 360,
                    pitch: Math.random() * 30 - 10,
                    zoom: 1
                });
                showToast('Found a nearby viewpoint!', 'success');
            } else {
                showToast('No other viewpoints available in this area', 'info');
            }
        }

    } catch (error) {
        console.error('Exploration error:', error);
        showToast('Exploration complete', 'info');
    } finally {
        setLoading(false);
    }
}

async function findRandomPanoramaInArea(stop) {
    const searchAttempts = 8;
    const baseRadius = 150;
    const maxRadius = 250;

    for (let attempt = 0; attempt < searchAttempts; attempt++) {
        try {
            const radius = baseRadius + Math.random() * (maxRadius - baseRadius);
            const angle = Math.random() * 2 * Math.PI;

            const latOffset = (radius / 111000) * Math.cos(angle);
            const lngOffset = (radius / (111000 * Math.cos(stop.coordinates.lat * Math.PI / 180))) * Math.sin(angle);

            const searchLat = stop.coordinates.lat + latOffset;
            const searchLng = stop.coordinates.lng + lngOffset;
            const searchPosition = new google.maps.LatLng(searchLat, searchLng);

            const panorama = await searchPanoramaAtLocation(searchPosition, 75);

            if (panorama && panorama.panoId && panorama.panoId !== stop.panoId) {
                console.log(`Found random panorama at attempt ${attempt + 1}`);
                return panorama;
            }

        } catch (error) {
            console.warn(`Search attempt ${attempt + 1} failed:`, error);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    return null;
}

async function findNearbyPanorama(stop, radius) {
    const basePosition = new google.maps.LatLng(stop.coordinates.lat, stop.coordinates.lng);
    return await searchPanoramaAtLocation(basePosition, radius);
}

async function searchPanoramaAtLocation(position, radius) {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(null), 5000);

        streetViewService.getPanorama({
            location: position,
            radius: radius,
            source: google.maps.StreetViewSource.OUTDOOR,
            preference: google.maps.StreetViewPreference.NEAREST
        }, (data, status) => {
            clearTimeout(timeoutId);

            if (status === 'OK' && data?.location) {
                resolve({
                    panoId: data.location.pano,
                    lat: data.location.latLng.lat(),
                    lng: data.location.latLng.lng()
                });
            } else {
                resolve(null);
            }
        });
    });
}

function returnToMainTour() {
    if (exploreLocation) {
        streetView.setPosition(exploreLocation);
        exploreLocation = null;
    } else if (currentStopIndex < tourItinerary.length) {
        moveToLocation(tourItinerary[currentStopIndex]);
    }

    tourState.endExploring();
}

// --- 12. TOUR COMPLETION ---
async function completeTour() {
    tourState.complete();
    stopAudio();

    setLoading(true, 'Creating your photo gallery...');

    try {
        await showFinalGallery(currentDestination);
    } catch (error) {
        console.error('Error showing gallery:', error);
        showToast('Tour completed!', 'info');
        resetToMainMenu();
    }
}

// --- 13. ITINERARY FETCHING ---
async function fetchItinerary(destination, focus) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-tour`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                destination: destination,
                focus: focus
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const itinerary = await response.json();

        if (!Array.isArray(itinerary) || itinerary.length === 0) {
            throw new Error("Invalid itinerary format");
        }

        return itinerary;

    } catch (error) {
        console.error('Failed to fetch itinerary:', error);
        throw new Error(`Could not generate tour: ${error.message}`);
    }
}

// --- 14. GALLERY FUNCTIONS ---
async function showFinalGallery(destination) {
    hideAllTourUI();

    try {
        const [images, videos, localInfo] = await Promise.all([
            fetchImages(destination).catch(() => []),
            fetchVideos(destination).catch(() => []),
            fetchLocalInfo(destination).catch(() => ({ weather: { text: 'Unavailable', emoji: '❔' }, timezone: null }))
        ]);

        if (localInfo.timezone) {
            destinationTimezone = localInfo.timezone;
            updateLocalTime(localTime);
        } else {
            localTime.textContent = new Date().toLocaleTimeString();
        }

        if (localInfo.weather) {
            localWeather.textContent = `${localInfo.weather.emoji} ${localInfo.weather.text}`;
        }

        fetchNewsOutlets(destination).then(news => {
            populateNews(news, localNews);
        }).catch(() => {
            localNews.innerHTML = '<p class="text-slate-400">News unavailable</p>';
        });

        const galleryItems = [...images, ...videos];
        galleryItems.sort(() => Math.random() - 0.5);

        populateGalleryGrid(galleryItems, destination);

        setLoading(false);
        toggleVisibility(galleryContainer, true);

    } catch (error) {
        console.error("Gallerycreation failed:", error);
        setLoading(false);
        galleryTitle.textContent = `Tour Complete: ${destination}`;
        galleryGrid.innerHTML = '<p class="text-slate-400 col-span-full text-center">Gallery content unavailable</p>';
        toggleVisibility(galleryContainer, true);
    }
}

async function fetchLocalInfo(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/local-info/${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Local info request failed');
        return await response.json();
    } catch (error) {
        return { weather: { text: 'Unavailable', emoji: '❔' }, timezone: null };
    }
}

async function fetchImages(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Image search failed');
        return await response.json();
    } catch (error) {
        return [];
    }
}

async function fetchVideos(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/videos/${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('YouTube search failed');
        return await response.json();
    } catch (error) {
        return [];
    }
}

async function fetchNewsOutlets(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/news/${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('News request failed');
        return await response.json();
    } catch (error) {
        return [];
    }
}

function populateNews(newsItems, element) {
    element.innerHTML = '';

    if (!newsItems || newsItems.length === 0) {
        element.innerHTML = '<p class="text-slate-400">No news outlets found.</p>';
        return;
    }

    newsItems.forEach(item => {
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.name;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'block text-cyan-300 hover:text-cyan-200 truncate';
        element.appendChild(link);
    });
}

function populateGalleryGrid(items, destination) {
    galleryTitle.textContent = `Tour Complete: ${destination}`;
    galleryGrid.innerHTML = '';

    if (!items || items.length === 0) {
        galleryGrid.innerHTML = `<p class="text-slate-400 col-span-full text-center">No gallery content available.</p>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'block aspect-video bg-slate-800 rounded-lg overflow-hidden shadow-lg border-2 border-slate-700 hover:border-cyan-400 transition-all';

        if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = item.url;
            img.className = 'w-full h-full object-cover';
            img.alt = `Image of ${destination}`;
            img.onerror = () => { div.style.display = 'none'; };
            div.appendChild(img);
        } else if (item.type === 'video') {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${item.videoId}`;
            iframe.className = 'w-full h-full';
            iframe.frameBorder = '0';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            div.appendChild(iframe);
        }

        galleryGrid.appendChild(div);
    });
}

function updateLocalTime(element) {
    if (localTimeInterval) clearInterval(localTimeInterval);
    localTimeInterval = setInterval(() => {
        if (destinationTimezone) {
            try {
                element.textContent = new Date().toLocaleTimeString('en-US', { 
                    timeZone: destinationTimezone, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                });
            } catch (error) {
                element.textContent = new Date().toLocaleTimeString();
            }
        } else {
            element.textContent = new Date().toLocaleTimeString();
        }
    }, 1000);
}

// --- 15. UTILITY AND RESET FUNCTIONS ---
function resetTourState() {
    stopAudio();
    stopBackgroundMusic();
    if (localTimeInterval) clearInterval(localTimeInterval);

    tourState.reset();
    destinationTimezone = null;
    currentStopIndex = 0;
    exploreLocation = null;
    tourItinerary = [];
    
    // Clean up music resources
    if (backgroundMusic) {
        URL.revokeObjectURL(backgroundMusic.src);
        backgroundMusic = null;
    }
    isMusicPlaying = false;

    if (locationProcessor) {
        locationProcessor.clearCache();
    }
}

function resetUI() {
    toggleVisibility(galleryContainer, false);
    toggleVisibility(streetviewContainer, false);
    toggleVisibility(addressLabel, false);
    toggleVisibility(controlsContainer, false);
    toggleVisibility(tourInfoContainer, false);

    if (streetView) streetView.setVisible(false);

    destinationInput.value = '';
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Tour';
    toggleVisibility(tourSetupContainer, true);

    if (galleryGrid) galleryGrid.innerHTML = '';
    setLoading(false);
}

function hideAllTourUI() {
    toggleVisibility(streetviewContainer, false);
    toggleVisibility(controlsContainer, false);
    toggleVisibility(addressLabel, false);
    toggleVisibility(tourInfoContainer, false);
    if (streetView) streetView.setVisible(false);
}

function resetToMainMenu() {
    resetTourState();
    resetUI();
    console.log('Reset to main menu');
}

function positionControls() {
    if (controlsContainer && window.innerHeight) {
        controlsContainer.style.bottom = '120px';
        controlsContainer.style.right = '16px';
    }
}

// --- 16. MUSIC FUNCTIONALITY ---
async function generateRegionalMusic(location) {
    try {
        setLoading(true, 'Generating regional music...');
        
        const response = await fetch(`${API_BASE_URL}/api/generate-music`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                location: location,
                style: 'ambient_regional',
                duration: 120 // 2 minutes
            })
        });

        if (!response.ok) {
            throw new Error('Music generation failed');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        backgroundMusic = new Audio(audioUrl);
        backgroundMusic.loop = true;
        backgroundMusic.volume = musicVolume;
        
        setLoading(false);
        return true;

    } catch (error) {
        console.error('Error generating regional music:', error);
        setLoading(false);
        showToast('Could not generate regional music', 'error');
        return false;
    }
}

function toggleBackgroundMusic() {
    if (!backgroundMusic) {
        if (currentDestination) {
            generateRegionalMusic(currentDestination).then(success => {
                if (success) {
                    playBackgroundMusic();
                }
            });
        } else {
            showToast('Please start a tour first', 'error');
        }
        return;
    }

    if (isMusicPlaying) {
        pauseBackgroundMusic();
    } else {
        playBackgroundMusic();
    }
}

function playBackgroundMusic() {
    if (backgroundMusic) {
        backgroundMusic.play();
        isMusicPlaying = true;
        musicIcon.textContent = '🔊';
        musicButton.title = 'Pause Music';
    }
}

function pauseBackgroundMusic() {
    if (backgroundMusic) {
        backgroundMusic.pause();
        isMusicPlaying = false;
        musicIcon.textContent = '🎵';
        musicButton.title = 'Play Music';
    }
}

function stopBackgroundMusic() {
    if (backgroundMusic) {
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
        isMusicPlaying = false;
        musicIcon.textContent = '🎵';
        musicButton.title = 'Play Music';
    }
}

// --- 17. EVENT LISTENERS ---
generateTourButton.addEventListener('click', generateTour);
endTourButton.addEventListener('click', resetToMainMenu);
pauseTourButton.addEventListener('click', togglePause);
exploreButton.addEventListener('click', exploreCurrentLocation);
returnToTourButton.addEventListener('click', returnToMainTour);
musicButton.addEventListener('click', toggleBackgroundMusic);
window.addEventListener('resize', positionControls);

destinationInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    generateTourButton.disabled = !value;
});

document.addEventListener('keydown', (e) => {
    // Don't trigger tour controls if chat modal is open
    if (!chatroomModal.classList.contains('hidden')) {
        return;
    }

    if (tourState.state === 'paused') {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            togglePause();
        }
    }
});

// --- 17. FIREBASE AUTHENTICATION ---
import authService from './auth-service.js';

// DOM elements for authentication
const googleSigninBtn = document.getElementById('google-signin-btn');
const showEmailAuthBtn = document.getElementById('show-email-auth');
const emailAuthModal = document.getElementById('email-auth-modal');
const closeEmailModalBtn = document.getElementById('close-email-modal');
const emailSigninBtn = document.getElementById('email-signin-btn');
const emailSignupBtn = document.getElementById('email-signup-btn');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const authButtons = document.getElementById('auth-buttons');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Authentication event listeners
googleSigninBtn.addEventListener('click', async () => {
    try {
        await authService.signInWithGoogle();
        showToast('Successfully signed in with Google!', 'success');
    } catch (error) {
        console.error('Google sign-in error:', error);
        showToast('Failed to sign in with Google', 'error');
    }
});

showEmailAuthBtn.addEventListener('click', () => {
    emailAuthModal.classList.remove('hidden');
});

closeEmailModalBtn.addEventListener('click', () => {
    emailAuthModal.classList.add('hidden');
    emailInput.value = '';
    passwordInput.value = '';
});

emailSigninBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }

    try {
        await authService.signInWithEmail(email, password);
        showToast('Successfully signed in!', 'success');
        emailAuthModal.classList.add('hidden');
        emailInput.value = '';
        passwordInput.value = '';
    } catch (error) {
        console.error('Email sign-in error:', error);
        showToast('Failed to sign in with email', 'error');
    }
});

emailSignupBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        await authService.signUpWithEmail(email, password);
        showToast('Account created successfully!', 'success');
        emailAuthModal.classList.add('hidden');
        emailInput.value = '';
        passwordInput.value = '';
    } catch (error) {
        console.error('Email sign-up error:', error);
        showToast('Failed to create account', 'error');
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        await authService.signOut();
        showToast('Signed out successfully', 'success');
    } catch (error) {
        console.error('Sign-out error:', error);
        showToast('Failed to sign out', 'error');
    }
});

// Authentication state handling
authService.onAuthStateChanged((user) => {
    console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');

    if (user) {
        console.log('User details:', {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
        });

        // Update UI for signed-in user
        updateAuthUI(user);

        // If chatroom is open, refresh the UI
        if (!chatroomModal.classList.contains('hidden') && currentChatroomId) {
            setTimeout(async () => {
                try {
                    const chatroomData = await chatroomService.getChatroomData(currentChatroomId);
                    setupMessageInput(user, chatroomData);
                } catch (error) {
                    console.error('Error refreshing chatroom UI:', error);
                }
            }, 500);
        }
    } else {
        console.log('User signed out');
        // Update UI for signed-out user
        updateAuthUI(null);

        // Close any open chatrooms
        if (!chatroomModal.classList.contains('hidden')) {
            closeAreaChat();
        }
    }
});

// Function to update authentication UI
function updateAuthUI(user) {
    if (user) {
        // User is signed in
        userInfo.classList.remove('hidden');
        userInfo.classList.add('flex');
        authButtons.classList.add('hidden');

        userName.textContent = user.displayName || user.email || 'User';
        userAvatar.src = user.photoURL || 'https://via.placeholder.com/32';
    } else {
        // User is signed out
        userInfo.classList.add('hidden');
        userInfo.classList.remove('flex');
        authButtons.classList.remove('hidden');
    }
}

// Close modal when clicking outside
emailAuthModal.addEventListener('click', (e) => {
    if (e.target === emailAuthModal) {
        emailAuthModal.classList.add('hidden');
        emailInput.value = '';
        passwordInput.value = '';
    }
});

console.log('Tour application with Google Cloud TTS loaded successfully');
// --- 18. CHAT INTEGRATION ---
import chatroomService from './chatroom-service.js';

const areaChatButton = document.getElementById('area-chat-button');
const chatroomModal = document.getElementById('chatroom-modal');
const closeChatroomButton = document.getElementById('close-chatroom');
const chatroomTitle = document.getElementById('chatroom-title');
const chatroomMessages = document.getElementById('chatroom-messages');
const chatroomInputSection = document.getElementById('chatroom-input-section');
const authRequiredMessage = document.getElementById('auth-required-message');

// Tab elements
const chatTab = document.getElementById('chat-tab');
const aiTab = document.getElementById('ai-tab');
const chatContent = document.getElementById('chat-content');
const aiContent = document.getElementById('ai-content');
const aiMessages = document.getElementById('ai-messages');
const aiMessageInput = document.getElementById('ai-message-input');
const aiSendButton = document.getElementById('ai-send-button');

let currentChatroomId = null;
let messageInput = null;
let sendButton = null;
let currentAreaName = '';

// Function to normalize destination for consistent chat room ID
function normalizeDestinationForChat(destination) {
    if (!destination || typeof destination !== 'string') return null;

    // Convert to lowercase and remove common suffixes
    let normalized = destination.toLowerCase().trim();

    if (normalized.length === 0) return null;

    // Remove country suffixes
    normalized = normalized.replace(/,?\s*(south korea|korea|japan|china|usa|united states|uk|united kingdom|france|germany|italy|spain)$/i, '');

    // Remove state/province suffixes for major cities
    normalized = normalized.replace(/,?\s*(seoul|tokyo|beijing|new york|california|london|paris|berlin)$/i, '');

    // Extract the main area name (first part before comma)
    const parts = normalized.split(',');
    normalized = parts[0].trim();

    // Replace spaces with underscores and remove special characters
    normalized = normalized.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    // Ensure minimum length
    if (normalized.length < 3) {
        // If too short, try using the original input with basic cleaning
        normalized = destination.toLowerCase().trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .substring(0, 50);
    }

    return normalized.length >= 3 ? normalized : null;
}

// Function to get proper destination name using Google Places API
async function getProperDestinationName(userInput) {
    try {
        const geocodeResults = await new Promise((resolve, reject) => {
            geocoder.geocode({ address: userInput }, (results, status) => {
                if (status === 'OK' && results?.[0]) {
                    resolve(results);
                } else {
                    reject(new Error(`Geocoding failed: ${status}`));
                }
            });
        });

        const result = geocodeResults[0];

        // Check if the user input appears in the formatted address
        // If so, try to preserve the specific area name they requested
        const userInputLower = userInput.toLowerCase().trim();
        const formattedAddressLower = result.formatted_address.toLowerCase();

        // Look for specific area/district/neighborhood types first
        let specificAreaName = '';
        for (const component of result.address_components) {
            const componentName = component.long_name.toLowerCase();
            const componentTypes = component.types;

            // Check if this component matches the user input and is a specific area
            if (componentName.includes(userInputLower) || userInputLower.includes(componentName)) {
                if (componentTypes.includes('sublocality') || 
                    componentTypes.includes('sublocality_level_1') ||
                    componentTypes.includes('neighborhood') ||
                    componentTypes.includes('route') ||
                    componentTypes.includes('establishment') ||
                    componentTypes.includes('point_of_interest')) {
                    specificAreaName = component.long_name;
                    break;
                }
            }
        }

        // If we found a specific area name, use it
        if (specificAreaName) {
            return specificAreaName;
        }

        // If the user input is contained in the formatted address, try to preserve it
        if (formattedAddressLower.includes(userInputLower)) {
            // Capitalize the user input properly
            return userInput.trim().split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        }

        // Fallback to extracting from address components
        let cityName = '';
        for (const component of result.address_components) {
            if (component.types.includes('locality')) {
                cityName = component.long_name;
                break;
            } else if (component.types.includes('administrative_area_level_1') && !cityName) {
                cityName = component.long_name;
            }
        }

        // Return the properly formatted name
        return cityName || result.formatted_address.split(',')[0];

    } catch (error) {
        console.warn('Could not get proper destination name:', error);
        // Fallback: capitalize first letter of each word
        return userInput.trim().split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
}

// Get area chat functionality
async function openAreaChat() {
    const user = authService.getCurrentUser();
    if (!user) {
        showToast('Please sign in to use area chat', 'error');
        return;
    }

    // Wait a moment to ensure authentication is fully processed
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        let areaId, areaName;

        // Always use the main destination (city) for chat, not specific tour locations
        let searchValue = currentDestination || destinationInput.value.trim();
        if (!searchValue) {
            showToast('Please enter a destination first', 'error');
            return;
        }

        // Clean the area ID for consistent chat rooms
        areaId = searchValue.toLowerCase().replace(/[^a-z0-9]/g, '');
        areaName = searchValue;

        if (!areaId || areaId.length < 3) {
            showToast('Could not determine the area chat ID.', 'error');
            return;
        }

        console.log('Opening chat for area:', areaId, areaName);

        currentChatroomId = areaId;
        currentAreaName = areaName;
        chatroomTitle.textContent = `${areaName} Area Chat`;
        chatroomModal.classList.remove('hidden');
        
        // Reset to chat tab when opening
        switchTab('chat');

        // Get or create chatroom
        const chatroomRef = await chatroomService.getChatroom(areaId, areaName, user);

        // Listen for messages
        chatroomService.subscribeToMessages(areaId, async (messages) => {
            const chatroomData = await chatroomService.getChatroomData(areaId);
            displayMessages(messages, chatroomData, user);
        });

        // Setup message input immediately after opening chat
        const chatroomData = await chatroomService.getChatroomData(areaId);
        setupMessageInput(user, chatroomData);

    } catch (error) {
        console.error('Error opening area chat:', error);
        showToast('Failed to open area chat: ' + error.message, 'error');
    }
}

async function updateChatPermissions(chatroomId, user) {
    if (!user) {
        chatroomInputSection.style.display = 'none';
        return;
    }

    try {
        const chatroom = await chatroomService.getChatroomData(chatroomId);
        const isAdmin = chatroom?.admins?.includes(user.uid);
        const isMasterAdmin = chatroom?.masterAdmins?.includes(user.uid);

        // Show input section for authenticated users
        chatroomInputSection.style.display = 'flex';

        // Update admin indicator
        const adminIndicator = document.querySelector('.admin-indicator');
        if (adminIndicator) {
            adminIndicator.textContent = isMasterAdmin ? 'Master Admin' : isAdmin ? 'Admin' : '';
            adminIndicator.style.display = (isAdmin || isMasterAdmin) ? 'inline' : 'none';
        }

    } catch (error) {
        console.error('Error updating chat permissions:', error);
        // Still show input section for authenticated users
        chatroomInputSection.style.display = 'flex';
    }
}

function setupMessageInput(user, chatroomData) {
    authRequiredMessage.classList.add('hidden');

    // Check if user is banned
    if (chatroomService.isBanned(chatroomData, user.uid)) {
        const bannedMessage = document.createElement('div');
        bannedMessage.className = 'text-red-400 text-center py-4';
        bannedMessage.textContent = 'You are banned from this chatroom';
        chatroomInputSection.innerHTML = '';
        chatroomInputSection.appendChild(bannedMessage);
        return;
    }

    // Create message input if it doesn't exist
    if (!messageInput) {
        const inputContainer = document.createElement('div');
        inputContainer.className = 'flex gap-2';

        messageInput = document.createElement('input');
        messageInput.type = 'text';
        messageInput.placeholder = 'Type your message...';
        messageInput.className = 'flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:border-cyan-400 focus:outline-none';

        sendButton = document.createElement('button');
        sendButton.textContent = 'Send';
        sendButton.className = 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-4 py-2 rounded transition-colors';

        inputContainer.appendChild(messageInput);
        inputContainer.appendChild(sendButton);
        chatroomInputSection.appendChild(inputContainer);

        // Add admin controls if user is admin
        if (chatroomService.isAdmin(chatroomData, user.uid)) {
            const adminNotice = document.createElement('div');
            adminNotice.className = 'text-yellow-400 text-xs mb-2 text-center';
            adminNotice.textContent = '👑 You are an admin of this chatroom';
            chatroomInputSection.insertBefore(adminNotice, inputContainer);
        }

        // Event listeners
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
}

async function sendMessage() {
    try {
        const user = authService.getCurrentUser();
        if (!user) {
            showToast('Please sign in to send messages', 'error');
            return;
        }

        const messageText = messageInput.value.trim();
        if (!messageText) {
            showToast('Please enter a message', 'error');
            return;
        }

        if (!currentChatroomId) {
            showToast('No active chatroom', 'error');
            return;
        }

        console.log('Sending message:', { messageText, chatroomId: currentChatroomId, user: user.uid });

        await chatroomService.sendMessage(currentChatroomId, messageText, user);
        messageInput.value = '';
        showToast('Message sent!', 'success');
    } catch (error) {
        console.error('Error sending message:', error);
        let errorMessage = 'Failed to send message';
        if (error.message) {
            errorMessage += ': ' + error.message;
        }
        showToast(errorMessage, 'error');
    }
}

function displayMessages(messages, chatroomData, currentUser) {
    chatroomMessages.innerHTML = '';

    if (messages.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'text-center text-gray-400 py-8';
        emptyState.textContent = 'No messages yet. Be the first to say hello!';
        chatroomMessages.appendChild(emptyState);
        return;
    }

    const isCurrentUserAdmin = chatroomService.isAdmin(chatroomData, currentUser.uid);

    messages.forEach(message => {
        const isOwnMessage = message.userId === currentUser.uid;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex items-start gap-3 p-2 hover:bg-slate-800 rounded group ${isOwnMessage ? 'flex-row-reverse' : ''}`;

        const avatar = document.createElement('img');
        avatar.src = message.userPhoto || 'https://via.placeholder.com/32';
        avatar.className = 'w-8 h-8 rounded-full flex-shrink-0';
        avatar.alt = message.userName;

        const content = document.createElement('div');
        content.className = `flex-1 min-w-0 ${isOwnMessage ? 'text-right' : ''}`;

        const header = document.createElement('div');
        header.className = `flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`;

        const userName = document.createElement('span');
        userName.className = `font-semibold text-sm ${isOwnMessage ? 'text-green-400' : 'text-cyan-400'}`;
        userName.textContent = message.userName;

        // Add admin badges
        if (chatroomService.isMasterAdmin(chatroomData, message.userId)) {
            const masterAdminBadge = document.createElement('span');
            masterAdminBadge.className = 'text-xs bg-purple-500 text-white px-1 rounded';
            masterAdminBadge.textContent = '🛡️';
            masterAdminBadge.title = 'Master Admin';
            header.appendChild(masterAdminBadge);
        } else if (chatroomService.isAdmin(chatroomData, message.userId)) {
            const adminBadge = document.createElement('span');
            adminBadge.className = 'text-xs bg-yellow-500 text-black px-1 rounded';
            adminBadge.textContent = '👑';
            adminBadge.title = 'Admin';
            header.appendChild(adminBadge);
        }

        const timestamp = document.createElement('span');
        timestamp.className = 'text-xs text-gray-500';
        if (message.timestamp) {
            const date = message.timestamp.toDate ? message.timestamp.toDate() : new Date(message.timestamp);
            timestamp.textContent = date.toLocaleTimeString();
        }

        // Add expiry info
        if (message.expiresAt) {
            const expiryDate = message.expiresAt.toDate ? message.expiresAt.toDate() : new Date(message.expiresAt);
            const timeLeft = Math.max(0, Math.floor((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60)));
            const expirySpan = document.createElement('span');
            expirySpan.className = 'text-xs text-gray-600';
            expirySpan.textContent = `(${timeLeft}h left)`;
            timestamp.appendChild(expirySpan);
        }

        const messageText = document.createElement('div');
        messageText.className = `text-gray-200 text-sm break-words ${isOwnMessage ? 'bg-cyan-600/30 p-2 rounded-lg inline-block max-w-xs ml-auto' : ''}`;
        messageText.textContent = message.text;

        header.appendChild(userName);
        header.appendChild(timestamp);
        content.appendChild(header);
        content.appendChild(messageText);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        // Add admin controls if current user is admin
        if (isCurrentUserAdmin && message.userId !== currentUser.uid) {
            const adminControls = document.createElement('div');
            adminControls.className = 'hidden group-hover:flex flex-col gap-1 ml-2';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Delete message';
            deleteBtn.onclick = () => deleteMessage(message.id);

            const banBtn = document.createElement('button');
            banBtn.className = 'text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded';
            banBtn.textContent = '🚫';
            banBtn.title = 'Ban user';
            banBtn.onclick = () => banUser(message.userId, message.userName);

            const kickBtn = document.createElement('button');
            kickBtn.className = 'text-xs bg-orange-600 hover:bg-orange-500 text-white px-2 py-1 rounded';
            kickBtn.textContent = '👢';
            kickBtn.title = 'Kick user (10 min)';
            kickBtn.onclick = () => kickUser(message.userId, message.userName);

            if (!chatroomService.isAdmin(chatroomData, message.userId)) {
                const promoteBtn = document.createElement('button');
                promoteBtn.className = 'text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-2 py-1 rounded';
                promoteBtn.textContent = '👑';
                promoteBtn.title = 'Make admin';
                promoteBtn.onclick = () => promoteToAdmin(message.userId, message.userName);
                adminControls.appendChild(promoteBtn);
            } else if (!chatroomService.isMasterAdmin(chatroomData, message.userId)) {
                const demoteBtn = document.createElement('button');
                demoteBtn.className = 'text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded';
                demoteBtn.textContent = '📉';
                demoteBtn.title = 'Remove admin';
                demoteBtn.onclick = () => demoteAdmin(message.userId, message.userName);
                adminControls.appendChild(demoteBtn);
            }

            // Master admin controls (only for master admins)
            if (chatroomService.isMasterAdmin(chatroomData, currentUser.uid)) {
                if (!chatroomService.isMasterAdmin(chatroomData, message.userId)) {
                    const masterPromoteBtn = document.createElement('button');
                    masterPromoteBtn.className = 'text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded';
                    masterPromoteBtn.textContent = '🛡️';
                    masterPromoteBtn.title = 'Make master admin';
                    masterPromoteBtn.onclick = () => promoteToMasterAdmin(message.userId, message.userName);
                    adminControls.appendChild(masterPromoteBtn);
                } else {
                    const masterDemoteBtn = document.createElement('button');
                    masterDemoteBtn.className = 'text-xs bg-purple-800 hover:bg-purple-700 text-white px-2 py-1 rounded';
                    masterDemoteBtn.textContent = '🚫👑';
                    masterDemoteBtn.title = 'Remove master admin';
                    masterDemoteBtn.onclick = () => demoteMasterAdmin(message.userId, message.userName);
                    adminControls.appendChild(masterDemoteBtn);
                }
            }

            adminControls.appendChild(deleteBtn);
            adminControls.appendChild(banBtn);
            adminControls.appendChild(kickBtn);

            messageDiv.appendChild(adminControls);
        }

        chatroomMessages.appendChild(messageDiv);
    });

    // Scroll to bottom
    chatroomMessages.scrollTop = chatroomMessages.scrollHeight;
}

function closeAreaChat() {
    chatroomModal.classList.add('hidden');

    if (currentChatroomId) {
        chatroomService.unsubscribeFromMessages(currentChatroomId);
        currentChatroomId = null;
    }

    // Clear messages
    chatroomMessages.innerHTML = '';
    
    // Reset AI chat
    aiMessages.innerHTML = `
        <div class="text-center text-gray-400 py-8">
            <div class="text-4xl mb-4">🤖</div>
            <p class="text-lg">Ask me anything about this area!</p>
            <p class="text-sm mt-2">I can help you with local information, attractions, history, and more.</p>
        </div>
    `;
    aiMessageInput.value = '';
    currentAreaName = '';
}

// Event listeners
areaChatButton.addEventListener('click', openAreaChat);
closeChatroomButton.addEventListener('click', closeAreaChat);

// Tab switching
chatTab.addEventListener('click', () => switchTab('chat'));
aiTab.addEventListener('click', () => switchTab('ai'));

// AI chat functionality
aiSendButton.addEventListener('click', sendAIMessage);
aiMessageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendAIMessage();
    }
});

// Tab switching function
function switchTab(tabName) {
    if (tabName === 'chat') {
        chatTab.classList.add('text-cyan-400', 'bg-slate-800', 'border-b-2', 'border-cyan-400');
        chatTab.classList.remove('text-gray-400');
        aiTab.classList.remove('text-cyan-400', 'bg-slate-800', 'border-b-2', 'border-cyan-400');
        aiTab.classList.add('text-gray-400');
        
        chatContent.classList.remove('hidden');
        aiContent.classList.add('hidden');
    } else if (tabName === 'ai') {
        aiTab.classList.add('text-cyan-400', 'bg-slate-800', 'border-b-2', 'border-cyan-400');
        aiTab.classList.remove('text-gray-400');
        chatTab.classList.remove('text-cyan-400', 'bg-slate-800', 'border-b-2', 'border-cyan-400');
        chatTab.classList.add('text-gray-400');
        
        aiContent.classList.remove('hidden');
        chatContent.classList.add('hidden');
    }
}

// AI chat functionality
async function sendAIMessage() {
    const message = aiMessageInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addAIMessage(message, 'user');
    aiMessageInput.value = '';

    // Add loading indicator
    const loadingId = addAIMessage('Thinking...', 'ai', true);

    try {
        const response = await fetch(`${API_BASE_URL}/api/area-ai-chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                areaName: currentAreaName,
                context: `Current area: ${currentAreaName}. The user is exploring this area virtually through street view and wants to know more about local information, attractions, history, culture, food, and places to visit.`
            })
        });

        if (!response.ok) {
            throw new Error('AI chat request failed');
        }

        const data = await response.json();
        
        // Remove loading message
        removeAIMessage(loadingId);
        
        // Add AI response
        addAIMessage(data.response, 'ai');

    } catch (error) {
        console.error('Error sending AI message:', error);
        
        // Remove loading message
        removeAIMessage(loadingId);
        
        // Add error message
        addAIMessage('Sorry, I encountered an error. Please try again.', 'ai');
    }
}

function addAIMessage(message, sender, isLoading = false) {
    const messageId = Date.now().toString();
    const user = authService.getCurrentUser();
    const isUserMessage = sender === 'user';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start gap-3 p-2 rounded ${isUserMessage ? 'bg-cyan-500/20 ml-8 flex-row-reverse' : 'bg-slate-800 mr-8'}`;
    messageDiv.id = `ai-message-${messageId}`;

    const avatar = document.createElement('div');
    avatar.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden';
    
    if (isUserMessage && user) {
        if (user.photoURL) {
            const img = document.createElement('img');
            img.src = user.photoURL;
            img.className = 'w-full h-full object-cover';
            img.alt = user.displayName || 'User';
            avatar.appendChild(img);
        } else {
            avatar.textContent = '👤';
            avatar.style.backgroundColor = '#0891b2';
        }
    } else {
        avatar.textContent = '🤖';
        avatar.style.backgroundColor = '#374151';
    }

    const content = document.createElement('div');
    content.className = `flex-1 min-w-0 ${isUserMessage ? 'text-right' : ''}`;
    
    // Add user name for user messages
    if (isUserMessage && user) {
        const nameDiv = document.createElement('div');
        nameDiv.className = 'text-xs text-green-400 mb-1 font-medium';
        nameDiv.textContent = user.displayName || user.email || 'You';
        content.appendChild(nameDiv);
    }
    
    const messageText = document.createElement('div');
    messageText.className = `text-gray-200 text-sm break-words ${isUserMessage ? 'bg-cyan-600/30 p-2 rounded-lg inline-block max-w-xs ml-auto' : ''}`;
    messageText.textContent = message;
    
    if (isLoading) {
        messageText.className += ' animate-pulse';
    }

    content.appendChild(messageText);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    // Check if this is the welcome message, if so replace it
    const welcomeMessage = aiMessages.querySelector('.text-center.text-gray-400');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    aiMessages.appendChild(messageDiv);
    aiMessages.scrollTop = aiMessages.scrollHeight;

    return messageId;
}

function removeAIMessage(messageId) {
    const messageElement = document.getElementById(`ai-message-${messageId}`);
    if (messageElement) {
        messageElement.remove();
    }
}

// Admin action functions
async function deleteMessage(messageId) {
    if (!currentChatroomId) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    try {
        await chatroomService.deleteMessage(currentChatroomId, messageId, user);
        showToast('Message deleted', 'success');
    } catch (error) {
        console.error('Error deleting message:', error);
        showToast('Failed to delete message', 'error');
    }
}

async function banUser(userId, userName) {
    if (!currentChatroomId) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    if (confirm(`Ban ${userName} from this chatroom?`)) {
        try {
            await chatroomService.banUser(currentChatroomId, userId, user);
            showToast(`${userName} has been banned`, 'success');
        } catch (error) {
            console.error('Error banning user:', error);
            showToast('Failed to ban user', 'error');
        }
    }
}

async function kickUser(userId, userName) {
    if (!currentChatroomId) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    if (confirm(`Kick ${userName} for 10 minutes?`)) {
        try {
            await chatroomService.kickUser(currentChatroomId, userId, user);
            showToast(`${userName} has been kicked for 10 minutes`, 'success');
        } catch (error) {
            console.error('Error kicking user:', error);
            showToast('Failed to kick user', 'error');
        }
    }
}

async function promoteToAdmin(userId, userName) {
    if (!currentChatroomId) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    if (confirm(`Make ${userName} an admin of this chatroom?`)) {
        try {
            await chatroomService.promoteToAdmin(currentChatroomId, userId, user);
            showToast(`${userName} is now an admin`, 'success');
        } catch (error) {
            console.error('Error promoting user:', error);
            showToast('Failed to promote user', 'error');
        }
    }
}

async function promoteToMasterAdmin(userId, userName) {
    if (!currentChatroomId) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    if (confirm(`Make ${userName} a MASTER ADMIN of this chatroom? This gives them full control over all admins and settings.`)) {
        try {
            await chatroomService.promoteToMasterAdmin(currentChatroomId, userId, user);
            showToast(`${userName} is now a master admin`, 'success');
        } catch (error) {
            console.error('Error promoting user:', error);
            showToast('Failed to promote user', 'error');
        }
    }
}

async function demoteMasterAdmin(userId, userName) {
    if (!currentChatroomId) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    if (confirm(`Remove ${userName} as master admin?`)) {
        try {
            await chatroomService.demoteMasterAdmin(currentChatroomId, userId, user);
            showToast(`${userName} is no longer a master admin`, 'success');
        } catch (error) {
            console.error('Error demoting user:', error);
            showToast('Failed to demote user', 'error');
        }
    }
}

async function demoteAdmin(userId, userName) {
    if (!currentChatroomId) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    if (confirm(`Remove ${userName} as admin?`)) {
        try {
            await chatroomService.demoteAdmin(currentChatroomId, userId, user);
            showToast(`${userName} is no longer an admin`, 'success');
        } catch (error) {
            console.error('Error demoting user:', error);
            showToast('Failed to demote user', 'error');
        }
    }
}



// Close modal when clicking outside
chatroomModal.addEventListener('click', (e) => {
    if (e.target === chatroomModal) {
        closeAreaChat();
    }
});

// The code was edited to ensure chat is for the destination area, and to ensure the input area is created properly.