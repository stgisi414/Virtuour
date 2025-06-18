
// --- 1. API KEY AND ENDPOINT CONFIGURATION ---
const GEMINI_API_KEY = 'AIzaSyDtLyUB-2wocE-uNG5e3pwNFArjn1GVTco';
const GOOGLE_API_KEY = 'AIzaSyCYxnWpHNlzAz5h2W3pGTaW_oIP1ukTs1Y';
const YOUTUBE_API_KEY = GOOGLE_API_KEY;
const CUSTOM_SEARCH_ENGINE_ID = '16b67ee3373714c2b';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const CUSTOM_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

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

// --- 3. GLOBAL VARIABLES ---
let streetView;
let geocoder;
let streetViewService;
let tourItinerary = [];
let currentStopIndex = 0;
let synth = window.speechSynthesis;
let currentDestination = '';
let localTimeInterval = null;
let destinationTimezone = null;
let currentUtterance = null;
let exploreLocation = null;

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
            fontFamily: "'Exo 2', sans-serif"
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

function stopSpeech() {
    if (currentUtterance) {
        synth.cancel();
        currentUtterance = null;
    }
    tourState.clearTimeouts();
}

// --- 6. INITIALIZATION ---
window.initializeTourApp = () => {
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
        
        generateTourButton.disabled = false;
        generateTourButton.textContent = 'Generate Tour';
        
        // Setup state machine listeners
        setupStateMachineListeners();
        
        console.log('Tour app initialized successfully');
    } catch (error) {
        console.error('Initialization failed:', error);
        showToast('Failed to initialize Google Maps. Please refresh the page.', 'error');
    }
};

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

// --- 7. LOCATION PROCESSING ---
async function findLocationUsingGeocoding(locationName, cityName) {
    const searchQuery = `${locationName}, ${cityName}`;
    
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Geocoding timeout for ${searchQuery}`));
        }, 10000);

        geocoder.geocode({ address: searchQuery }, (results, status) => {
            clearTimeout(timeoutId);
            
            if (status === 'OK' && results && results.length > 0) {
                const result = results[0];
                resolve({
                    lat: result.geometry.location.lat(),
                    lng: result.geometry.location.lng(),
                    placeId: result.place_id,
                    formattedAddress: result.formatted_address,
                    method: 'geocoding'
                });
            } else {
                reject(new Error(`Geocoding failed for ${searchQuery}: ${status}`));
            }
        });
    });
}

async function findStreetViewLocation(coordinates, locationName) {
    const position = new google.maps.LatLng(coordinates.lat, coordinates.lng);
    
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Street View timeout for ${locationName}`));
        }, 10000);
        
        streetViewService.getPanorama({
            location: position,
            radius: 150,
            source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
            clearTimeout(timeoutId);
            
            if (status === 'OK' && data && data.location) {
                resolve({
                    lat: data.location.latLng.lat(),
                    lng: data.location.latLng.lng(),
                    panoId: data.location.pano,
                    hasStreetView: true
                });
            } else {
                resolve({
                    lat: coordinates.lat,
                    lng: coordinates.lng,
                    panoId: null,
                    hasStreetView: false
                });
            }
        });
    });
}

// --- 8. TOUR GENERATION ---
async function generateTour() {
    currentDestination = destinationInput.value.trim();
    const selectedFocus = tourFocus.value;
    
    if (!currentDestination) {
        showToast('Please enter a destination city.', 'error');
        return;
    }
    
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
        setLoading(false);
        
        // Start the tour with the new state machine
        startTourSequence();
        
    } catch (error) {
        console.error('Error generating tour:', error);
        showToast(`Failed to generate tour: ${error.message}`, 'error');
        resetToMainMenu();
    }
}

async function processItinerary(rawItinerary, cityName) {
    const processedStops = [];
    
    for (let i = 0; i < rawItinerary.length; i++) {
        const stop = rawItinerary[i];
        setLoading(true, `Processing ${i + 1}/${rawItinerary.length}: ${stop.locationName}...`);
        
        try {
            const locationData = await findLocationUsingGeocoding(stop.locationName, cityName);
            const streetViewData = await findStreetViewLocation(locationData, stop.locationName);
            
            processedStops.push({
                locationName: stop.locationName,
                briefDescription: stop.briefDescription,
                coordinates: { lat: locationData.lat, lng: locationData.lng },
                streetViewCoordinates: { lat: streetViewData.lat, lng: streetViewData.lng },
                placeId: locationData.placeId,
                panoId: streetViewData.panoId,
                hasStreetView: streetViewData.hasStreetView,
                formattedAddress: locationData.formattedAddress
            });
            
            console.log(`✓ Processed: ${stop.locationName}`);
            
        } catch (error) {
            console.warn(`✗ Failed: ${stop.locationName} - ${error.message}`);
        }
    }
    
    return processedStops;
}

// --- 9. TOUR EXECUTION WITH STATE MACHINE ---
function startTourSequence() {
    currentStopIndex = 0;
    tourState.start();
    
    // Move to first location immediately
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
        console.log(`Moving to: ${stop.locationName}`);
        
        const position = new google.maps.LatLng(stop.streetViewCoordinates.lat, stop.streetViewCoordinates.lng);
        
        if (stop.panoId && stop.hasStreetView) {
            streetView.setPano(stop.panoId);
        } else {
            streetView.setPosition(position);
        }
        
        streetView.setPov({ heading: 0, pitch: 0 });
        streetView.setZoom(1);
        
        updateAddressLabel(stop.locationName);
        
    } catch (error) {
        console.error(`Error moving to ${stop.locationName}:`, error);
        throw error;
    }
}

function presentCurrentLocation() {
    if (currentStopIndex >= tourItinerary.length) return;
    
    const location = tourItinerary[currentStopIndex];
    stopSpeech();
    
    // Show information
    const subtitle = `${location.locationName}: ${location.briefDescription}`;
    subtitlesContainer.textContent = subtitle;
    toggleVisibility(tourInfoContainer, true);
    
    // Auto-pause at each location
    tourState.pause();
    
    // Speak description
    speakLocationDescription(location);
}

function speakLocationDescription(location) {
    if ('speechSynthesis' in window) {
        const text = `Welcome to ${location.locationName}. ${location.briefDescription}. You can explore this area or continue to the next location.`;
        
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1.1;
        
        currentUtterance.onend = () => {
            toggleVisibility(tourInfoContainer, false);
            currentUtterance = null;
        };
        
        currentUtterance.onerror = () => {
            toggleVisibility(tourInfoContainer, false);
            currentUtterance = null;
        };
        
        synth.speak(currentUtterance);
        
        // Fallback timeout
        tourState.setTimeout(() => {
            if (currentUtterance) {
                synth.cancel();
                toggleVisibility(tourInfoContainer, false);
                currentUtterance = null;
            }
        }, 15000);
    } else {
        tourState.setTimeout(() => {
            toggleVisibility(tourInfoContainer, false);
        }, 5000);
    }
}

function continueToNextLocation() {
    if (currentStopIndex >= tourItinerary.length - 1) {
        // Last location - complete tour
        completeTour();
        return;
    }
    
    const nextIndex = currentStopIndex + 1;
    const nextLocation = tourItinerary[nextIndex];
    
    setLoading(true, `Traveling to ${nextLocation.locationName}...`);
    
    // Use requestAnimationFrame for smooth transitions
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
    const duration = 2000; // 2 seconds
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
                    // Final positioning
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
    exploreButton.style.display = 'none';
    returnToTourButton.style.display = 'none';
    pauseTourButton.style.display = 'flex';
    
    pauseIcon.textContent = '⏸️';
    pauseText.textContent = 'Pause Tour';
    pauseTourButton.className = 'bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-red-400 transition-colors duration-300 flex items-center gap-2';
}

function updateControlsForPaused() {
    exploreButton.style.display = 'flex';
    returnToTourButton.style.display = 'none';
    pauseTourButton.style.display = 'flex';
    
    if (currentStopIndex >= tourItinerary.length - 1) {
        pauseIcon.textContent = '🏁';
        pauseText.textContent = 'End Tour';
        pauseTourButton.className = 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-2 px-4 rounded-lg shadow-lg border border-cyan-400 transition-colors duration-300 flex items-center gap-2';
    } else {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Continue';
        pauseTourButton.className = 'bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-green-400 transition-colors duration-300 flex items-center gap-2';
    }
}

function updateControlsForExploring() {
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
        const betterView = await findBetterView(currentStop);
        
        if (betterView) {
            if (betterView.panoId) {
                streetView.setPano(betterView.panoId);
            } else {
                streetView.setPosition(new google.maps.LatLng(betterView.lat, betterView.lng));
            }
            showToast('Found a different view!', 'success');
        } else {
            const currentPov = streetView.getPov();
            streetView.setPov({
                heading: (currentPov.heading + 90) % 360,
                pitch: Math.max(-90, Math.min(90, currentPov.pitch + 10))
            });
            showToast('Adjusted view', 'info');
        }
        
    } catch (error) {
        showToast('Exploration complete', 'info');
    } finally {
        setLoading(false);
    }
}

async function findBetterView(stop) {
    try {
        const position = new google.maps.LatLng(stop.coordinates.lat, stop.coordinates.lng);
        
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => resolve(null), 5000);
            
            streetViewService.getPanorama({
                location: position,
                radius: 75,
                source: google.maps.StreetViewSource.OUTDOOR
            }, (data, status) => {
                clearTimeout(timeoutId);
                
                if (status === 'OK' && data && data.location && data.location.pano !== stop.panoId) {
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
    } catch (error) {
        return null;
    }
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
    stopSpeech();
    
    setLoading(true, 'Creating your photo gallery...');
    
    try {
        await showFinalGallery(currentDestination);
    } catch (error) {
        console.error('Error showing gallery:', error);
        showToast('Tour completed!', 'info');
        resetToMainMenu();
    }
}

// --- 13. UTILITY AND RESET FUNCTIONS ---
function resetTourState() {
    stopSpeech();
    if (localTimeInterval) clearInterval(localTimeInterval);
    
    tourState.reset();
    destinationTimezone = null;
    currentStopIndex = 0;
    exploreLocation = null;
    tourItinerary = [];
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

// --- 14. ITINERARY FETCHING ---
async function fetchItinerary(destination, focus) {
    const prompt = `
        Create a 5-stop virtual tour itinerary for "${destination}" with focus on "${focus}".
        
        For each stop, provide:
        1. "locationName": Specific landmark/attraction name
        2. "briefDescription": One engaging sentence about this location
        
        Ensure locations are well-known, publicly accessible places with Street View coverage.
        
        Respond with ONLY a valid JSON array.
        
        Example:
        [
            {
                "locationName": "Statue of Liberty",
                "briefDescription": "This iconic symbol of freedom has welcomed visitors to New York Harbor since 1886."
            }
        ]
    `;
    
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    response_mime_type: "application/json"
                }
            }),
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        const itinerary = JSON.parse(data.candidates[0].content.parts[0].text);
        
        if (!Array.isArray(itinerary) || itinerary.length === 0) {
            throw new Error("Invalid itinerary format");
        }
        
        return itinerary;
        
    } catch (error) {
        console.error('Failed to fetch itinerary:', error);
        throw new Error(`Could not generate tour: ${error.message}`);
    }
}

// --- 15. GALLERY FUNCTIONS (Simplified for reliability) ---
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
        console.error("Gallery creation failed:", error);
        setLoading(false);
        galleryTitle.textContent = `Tour Complete: ${destination}`;
        galleryGrid.innerHTML = '<p class="text-slate-400 col-span-full text-center">Gallery content unavailable</p>';
        toggleVisibility(galleryContainer, true);
    }
}

async function fetchLocalInfo(query) {
    const prompt = `Provide local information for ${query}. Respond with JSON containing "weather" (object with "temp_c", "temp_f", "condition") and "timezone" (IANA timezone).`;
    
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0, response_mime_type: "application/json" }
            }),
        });
        
        if (!response.ok) throw new Error('Local info request failed');
        
        const data = await response.json();
        const info = JSON.parse(data.candidates[0].content.parts[0].text);
        
        let weatherText = 'Unavailable';
        let weatherEmoji = '❔';
        
        if (info.weather && info.weather.condition) {
            const condition = info.weather.condition.toLowerCase();
            if (condition.includes('sun') || condition.includes('clear')) weatherEmoji = '☀️';
            else if (condition.includes('cloud')) weatherEmoji = '☁️';
            else if (condition.includes('rain')) weatherEmoji = '🌧️';
            else if (condition.includes('storm')) weatherEmoji = '⛈️';
            else if (condition.includes('snow')) weatherEmoji = '❄️';
            else if (condition.includes('fog')) weatherEmoji = '🌫️';
            
            weatherText = `${info.weather.temp_f}°F / ${info.weather.temp_c}°C, ${info.weather.condition}`;
        }
        
        return {
            weather: { text: weatherText, emoji: weatherEmoji },
            timezone: info.timezone || null
        };
        
    } catch (error) {
        return { weather: { text: 'Unavailable', emoji: '❔' }, timezone: null };
    }
}

async function fetchImages(query) {
    const url = `${CUSTOM_SEARCH_API_URL}?key=${GOOGLE_API_KEY}&cx=${CUSTOM_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&searchType=image&num=8`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Image search failed');
        
        const data = await response.json();
        return data.items ? data.items.map(item => ({ type: 'image', url: item.link })) : [];
        
    } catch (error) {
        return [];
    }
}

async function fetchVideos(query) {
    const url = `${YOUTUBE_API_URL}?key=${YOUTUBE_API_KEY}&part=snippet&q=${encodeURIComponent(query + " tour")}&type=video&maxResults=4&videoEmbeddable=true`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('YouTube search failed');
        
        const data = await response.json();
        return data.items ? data.items.map(item => ({ type: 'video', videoId: item.id.videoId })) : [];
        
    } catch (error) {
        return [];
    }
}

async function fetchNewsOutlets(query) {
    const prompt = `List 3-4 major local news outlets for ${query}. Respond with JSON array of objects with "name" and "url" properties.`;
    
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, response_mime_type: "application/json" }
            }),
        });
        
        if (!response.ok) throw new Error('News request failed');
        
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
        
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

// --- 16. EVENT LISTENERS ---
generateTourButton.addEventListener('click', generateTour);
endTourButton.addEventListener('click', resetToMainMenu);
pauseTourButton.addEventListener('click', togglePause);
exploreButton.addEventListener('click', exploreCurrentLocation);
returnToTourButton.addEventListener('click', returnToMainTour);
window.addEventListener('resize', positionControls);

destinationInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    generateTourButton.disabled = !value;
});

document.addEventListener('keydown', (e) => {
    if (tourState.state === 'paused') {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            togglePause();
        }
    }
});

console.log('Rewritten tour application loaded successfully');
