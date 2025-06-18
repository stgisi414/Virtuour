
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
let placesService;
let geocoder;
let streetViewService;
let tourItinerary = [];
let currentStopIndex = 0;
let synth = window.speechSynthesis;
let currentDestination = '';
let localTimeInterval = null;
let destinationTimezone = null;
let tourState = 'setup'; // 'setup', 'touring', 'paused', 'exploring', 'gallery'
let currentUtterance = null;
let exploreLocation = null;

// --- 4. CORE UTILITY FUNCTIONS ---
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
}

// --- 5. INITIALIZATION ---
window.initializeTourApp = () => {
    // Initialize Google Maps services
    streetView = new google.maps.StreetViewPanorama(streetviewContainer, {
        position: { lat: 40.7291, lng: -73.9965 },
        pov: { heading: 165, pitch: 0 },
        zoom: 1,
        visible: false,
        addressControl: false,
        linksControl: false,
        fullscreenControl: false,
        enableCloseButton: false,
        motionTracking: false,
        motionTrackingControl: false,
    });
    
    // Create a hidden map for Places service
    const hiddenMap = new google.maps.Map(document.createElement('div'));
    placesService = new google.maps.places.PlacesService(hiddenMap);
    geocoder = new google.maps.Geocoder();
    streetViewService = new google.maps.StreetViewService();
    
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Tour';
    
    console.log('Tour app initialized successfully');
};

// --- 6. LOCATION FINDING SYSTEM ---
async function findBestLocation(locationName, cityName) {
    const searchQuery = `${locationName}, ${cityName}`;
    
    // Method 1: Try Places Text Search
    try {
        const textSearchResult = await new Promise((resolve, reject) => {
            const request = {
                query: searchQuery,
                fields: ['geometry', 'place_id', 'name']
            };
            
            placesService.textSearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
                    resolve(results[0]);
                } else {
                    reject(new Error(`Places search failed: ${status}`));
                }
            });
        });
        
        if (textSearchResult.geometry && textSearchResult.geometry.location) {
            return {
                lat: textSearchResult.geometry.location.lat(),
                lng: textSearchResult.geometry.location.lng(),
                placeId: textSearchResult.place_id,
                method: 'places'
            };
        }
    } catch (error) {
        console.warn(`Places search failed for ${searchQuery}:`, error.message);
    }
    
    // Method 2: Fallback to Geocoding
    try {
        const geocodeResult = await new Promise((resolve, reject) => {
            geocoder.geocode({ address: searchQuery }, (results, status) => {
                if (status === 'OK' && results && results.length > 0) {
                    resolve(results[0]);
                } else {
                    reject(new Error(`Geocoding failed: ${status}`));
                }
            });
        });
        
        if (geocodeResult.geometry && geocodeResult.geometry.location) {
            return {
                lat: geocodeResult.geometry.location.lat(),
                lng: geocodeResult.geometry.location.lng(),
                placeId: geocodeResult.place_id,
                method: 'geocoding'
            };
        }
    } catch (error) {
        console.warn(`Geocoding failed for ${searchQuery}:`, error.message);
    }
    
    throw new Error(`Could not find location for: ${locationName}`);
}

async function findStreetViewLocation(coordinates, locationName, maxRadius = 100) {
    const position = new google.maps.LatLng(coordinates.lat, coordinates.lng);
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Street View search timed out for ${locationName}`));
        }, 8000);
        
        streetViewService.getPanorama({
            location: position,
            radius: maxRadius,
            source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
            clearTimeout(timeout);
            
            if (status === 'OK' && data && data.location) {
                resolve({
                    lat: data.location.latLng.lat(),
                    lng: data.location.latLng.lng(),
                    panoId: data.location.pano
                });
            } else {
                // If no Street View found, use original coordinates
                console.warn(`No Street View found for ${locationName}, using original coordinates`);
                resolve({
                    lat: coordinates.lat,
                    lng: coordinates.lng,
                    panoId: null
                });
            }
        });
    });
}

// --- 7. TOUR GENERATION ---
async function generateTour() {
    currentDestination = destinationInput.value.trim();
    const selectedFocus = tourFocus.value;
    
    if (!currentDestination) {
        showToast('Please enter a destination city.', 'error');
        return;
    }
    
    tourState = 'touring';
    currentStopIndex = 0;
    toggleVisibility(tourSetupContainer, false);
    
    try {
        setLoading(true, `Creating ${selectedFocus} tour for ${currentDestination}...`);
        
        // Generate itinerary
        const rawItinerary = await fetchItinerary(currentDestination, selectedFocus);
        
        // Process and validate each location
        setLoading(true, 'Finding precise locations...');
        tourItinerary = await processItinerary(rawItinerary, currentDestination);
        
        if (tourItinerary.length === 0) {
            throw new Error('No valid locations found for this tour');
        }
        
        // Initialize tour UI
        toggleVisibility(streetviewContainer, true);
        streetView.setVisible(true);
        toggleVisibility(controlsContainer, true);
        positionControls();
        
        // Start the tour
        await startTour();
        
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
        setLoading(true, `Processing location ${i + 1}/${rawItinerary.length}: ${stop.locationName}...`);
        
        try {
            // Find the best coordinates for this location
            const locationData = await findBestLocation(stop.locationName, cityName);
            
            // Find Street View location
            const streetViewData = await findStreetViewLocation(locationData, stop.locationName);
            
            processedStops.push({
                locationName: stop.locationName,
                briefDescription: stop.briefDescription,
                coordinates: {
                    lat: locationData.lat,
                    lng: locationData.lng
                },
                streetViewCoordinates: {
                    lat: streetViewData.lat,
                    lng: streetViewData.lng
                },
                placeId: locationData.placeId,
                panoId: streetViewData.panoId,
                method: locationData.method
            });
            
            console.log(`✓ Processed: ${stop.locationName} via ${locationData.method}`);
            
        } catch (error) {
            console.warn(`✗ Failed to process: ${stop.locationName} - ${error.message}`);
            showToast(`Could not locate: ${stop.locationName}`, 'error');
        }
    }
    
    return processedStops;
}

// --- 8. TOUR EXECUTION ---
async function startTour() {
    if (tourItinerary.length === 0) {
        throw new Error('No valid stops in itinerary');
    }
    
    currentStopIndex = 0;
    await visitStop(tourItinerary[0]);
    
    // Start tour progression
    await runTourLoop();
}

async function runTourLoop() {
    while (currentStopIndex < tourItinerary.length && tourState === 'touring') {
        const currentStop = tourItinerary[currentStopIndex];
        
        // Wait for user to continue (pause mechanism)
        if (tourState === 'touring') {
            await waitForContinue();
        }
        
        // Check if we're at the last stop
        if (currentStopIndex === tourItinerary.length - 1) {
            // Last stop - show end tour option
            pauseIcon.textContent = '🏁';
            pauseText.textContent = 'End Tour';
            pauseTourButton.className = 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-2 px-4 rounded-lg shadow-lg border border-cyan-400 transition-colors duration-300 flex items-center gap-2';
            await waitForContinue();
            break;
        }
        
        // Move to next stop
        const nextStopIndex = currentStopIndex + 1;
        const nextStop = tourItinerary[nextStopIndex];
        
        if (nextStop) {
            setLoading(true, `Traveling to ${nextStop.locationName}...`);
            await travelToStop(currentStop, nextStop);
            currentStopIndex = nextStopIndex;
            await visitStop(nextStop);
        }
    }
    
    // Tour completed
    await showFinalGallery(currentDestination);
}

async function visitStop(stop) {
    try {
        // Set Street View position
        const position = new google.maps.LatLng(stop.streetViewCoordinates.lat, stop.streetViewCoordinates.lng);
        
        if (stop.panoId) {
            streetView.setPano(stop.panoId);
        } else {
            streetView.setPosition(position);
        }
        
        // Update UI
        updateAddressLabel(stop.locationName);
        setLoading(false);
        
        // Show location info and speak
        await presentLocation(stop);
        
    } catch (error) {
        console.error(`Error visiting ${stop.locationName}:`, error);
        showToast(`Error at ${stop.locationName}: ${error.message}`, 'error');
    }
}

async function presentLocation(location) {
    // Stop any current speech
    stopSpeech();
    
    // Show subtitle
    subtitlesContainer.textContent = `${location.locationName}: ${location.briefDescription}`;
    toggleVisibility(tourInfoContainer, true);
    
    // Set up controls
    exploreButton.style.display = 'flex';
    returnToTourButton.style.display = 'none';
    pauseTourButton.style.display = 'flex';
    positionControls();
    
    // Speak the description
    if ('speechSynthesis' in window) {
        const text = `We have arrived at ${location.locationName}. ${location.briefDescription}. You can explore this area or continue the tour.`;
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1.1;
        
        currentUtterance.onend = () => {
            toggleVisibility(tourInfoContainer, false);
            currentUtterance = null;
        };
        
        synth.speak(currentUtterance);
    } else {
        // Fallback for browsers without speech synthesis
        setTimeout(() => {
            toggleVisibility(tourInfoContainer, false);
        }, 5000);
    }
    
    // Auto-pause the tour at each stop
    tourState = 'paused';
    pauseIcon.textContent = '▶️';
    pauseText.textContent = 'Continue Tour';
    pauseTourButton.className = 'bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-green-400 transition-colors duration-300 flex items-center gap-2';
}

async function travelToStop(fromStop, toStop) {
    return new Promise((resolve) => {
        const fromPosition = new google.maps.LatLng(fromStop.coordinates.lat, fromStop.coordinates.lng);
        const toPosition = new google.maps.LatLng(toStop.coordinates.lat, toStop.coordinates.lng);
        
        // Simple smooth transition
        const steps = 30;
        let currentStep = 0;
        
        const animate = () => {
            if (currentStep >= steps) {
                resolve();
                return;
            }
            
            const progress = currentStep / steps;
            const lat = fromPosition.lat() + (toPosition.lat() - fromPosition.lat()) * progress;
            const lng = fromPosition.lng() + (toPosition.lng() - fromPosition.lng()) * progress;
            
            streetView.setPosition(new google.maps.LatLng(lat, lng));
            
            currentStep++;
            setTimeout(animate, 100);
        };
        
        animate();
    });
}

// --- 9. TOUR CONTROLS ---
async function waitForContinue() {
    return new Promise((resolve) => {
        const checkState = () => {
            if (tourState === 'touring') {
                resolve();
            } else {
                setTimeout(checkState, 100);
            }
        };
        checkState();
    });
}

function togglePause() {
    if (tourState === 'paused') {
        tourState = 'touring';
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'Pause Tour';
        pauseTourButton.className = 'bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-red-400 transition-colors duration-300 flex items-center gap-2';
        exploreButton.style.display = 'none';
    } else if (tourState === 'touring') {
        tourState = 'paused';
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Continue Tour';
        pauseTourButton.className = 'bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-green-400 transition-colors duration-300 flex items-center gap-2';
        exploreButton.style.display = 'flex';
    } else if (currentStopIndex === tourItinerary.length - 1) {
        // End tour
        showFinalGallery(currentDestination);
    }
}

async function exploreCurrentLocation() {
    if (tourState !== 'paused' || currentStopIndex >= tourItinerary.length) return;
    
    const currentStop = tourItinerary[currentStopIndex];
    tourState = 'exploring';
    exploreLocation = streetView.getPosition();
    
    setLoading(true, `Looking for interior view of ${currentStop.locationName}...`);
    
    try {
        // Try to find an indoor panorama
        const indoorPano = await findIndoorPanorama(currentStop);
        
        if (indoorPano) {
            streetView.setPano(indoorPano.panoId);
            showToast('Found interior view!', 'success');
        } else {
            // Try to get closer to the building
            const closerView = await getCloserView(currentStop);
            if (closerView) {
                streetView.setPosition(new google.maps.LatLng(closerView.lat, closerView.lng));
                showToast('Moved to a closer view', 'info');
            } else {
                throw new Error('No better view available');
            }
        }
        
        // Update UI for explore mode
        exploreButton.style.display = 'none';
        pauseTourButton.style.display = 'none';
        returnToTourButton.style.display = 'flex';
        
    } catch (error) {
        showToast('No interior view available for this location', 'error');
        tourState = 'paused';
    } finally {
        setLoading(false);
    }
}

async function findIndoorPanorama(stop) {
    if (!stop.placeId) return null;
    
    return new Promise((resolve) => {
        streetViewService.getPanorama({
            location: new google.maps.LatLng(stop.coordinates.lat, stop.coordinates.lng),
            radius: 50,
            source: google.maps.StreetViewSource.INDOOR
        }, (data, status) => {
            if (status === 'OK' && data && data.location) {
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

async function getCloserView(stop) {
    const radius = 25; // Smaller radius for closer view
    
    return new Promise((resolve) => {
        streetViewService.getPanorama({
            location: new google.maps.LatLng(stop.coordinates.lat, stop.coordinates.lng),
            radius: radius,
            source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
            if (status === 'OK' && data && data.location) {
                resolve({
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
    }
    
    tourState = 'paused';
    returnToTourButton.style.display = 'none';
    exploreButton.style.display = 'flex';
    pauseTourButton.style.display = 'flex';
}

// --- 10. ITINERARY FETCHING ---
async function fetchItinerary(destination, focus) {
    const prompt = `
        Create a 5-stop virtual tour itinerary for "${destination}" with focus on "${focus}".
        
        For each stop, provide:
        1. "locationName": Specific landmark/attraction name
        2. "briefDescription": One engaging sentence about this location
        
        Respond with ONLY a valid JSON array. No other text.
        
        Example format:
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
        
        // Validate each stop
        itinerary.forEach((stop, index) => {
            if (!stop.locationName || !stop.briefDescription) {
                throw new Error(`Invalid stop at index ${index}`);
            }
        });
        
        return itinerary;
        
    } catch (error) {
        console.error('Failed to fetch itinerary:', error);
        throw new Error(`Could not generate tour: ${error.message}`);
    }
}

// --- 11. UI HELPERS ---
function positionControls() {
    const tourInfo = document.getElementById('tour-information');
    if (tourInfo && controlsContainer) {
        const tourInfoRect = tourInfo.getBoundingClientRect();
        const tourInfoTop = tourInfoRect.top + window.scrollY;
        controlsContainer.style.bottom = `${window.innerHeight - tourInfoTop + 10}px`;
        controlsContainer.style.right = '16px';
    }
}

function updateLocalTime(element) {
    if (localTimeInterval) clearInterval(localTimeInterval);
    localTimeInterval = setInterval(() => {
        if (destinationTimezone) {
            element.textContent = new Date().toLocaleTimeString('en-US', { 
                timeZone: destinationTimezone, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
        } else {
            element.textContent = new Date().toLocaleTimeString();
        }
    }, 1000);
}

function resetToMainMenu() {
    // Stop all processes
    if (localTimeInterval) clearInterval(localTimeInterval);
    stopSpeech();
    
    // Reset state
    tourState = 'setup';
    destinationTimezone = null;
    currentStopIndex = 0;
    exploreLocation = null;
    
    // Reset UI
    toggleVisibility(galleryContainer, false);
    toggleVisibility(streetviewContainer, false);
    toggleVisibility(addressLabel, false);
    toggleVisibility(controlsContainer, false);
    toggleVisibility(tourInfoContainer, false);
    streetView.setVisible(false);
    
    // Reset form
    destinationInput.value = '';
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Another Tour';
    toggleVisibility(tourSetupContainer, true);
    
    // Clear gallery
    galleryGrid.innerHTML = '';
    
    setLoading(false);
    console.log('Reset to main menu');
}

// --- 12. GALLERY AND LOCAL INFO ---
async function showFinalGallery(destination) {
    toggleVisibility(streetviewContainer, false);
    streetView.setVisible(false);
    toggleVisibility(controlsContainer, false);
    toggleVisibility(addressLabel, false);
    
    setLoading(true, 'Creating gallery and fetching local information...');
    
    try {
        const [images, videos, localInfo, news] = await Promise.all([
            fetchImages(destination),
            fetchVideos(destination),
            fetchLocalInfo(destination),
            fetchNewsOutlets(destination)
        ]);
        
        // Update local information
        destinationTimezone = localInfo.timezone;
        updateLocalTime(localTime);
        
        if (localInfo.weather) {
            localWeather.textContent = `${localInfo.weather.emoji} ${localInfo.weather.text}`;
        }
        
        populateNews(news, localNews);
        
        // Combine and shuffle gallery items
        const galleryItems = [...images, ...videos];
        galleryItems.sort(() => Math.random() - 0.5);
        
        populateGalleryGrid(galleryItems, destination);
        
        setLoading(false);
        toggleVisibility(galleryContainer, true);
        
    } catch (error) {
        console.error("Failed to create gallery:", error);
        setLoading(false);
        showToast(`Could not create gallery for ${destination}`, 'error');
        resetToMainMenu();
    }
}

async function fetchLocalInfo(query) {
    const prompt = `Provide current local information for ${query}. Respond with valid JSON containing "weather" (object with "temp_c", "temp_f", "condition") and "timezone" (IANA timezone string).`;
    
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0,
                    response_mime_type: "application/json"
                }
            }),
        });
        
        if (!response.ok) throw new Error('Local info API request failed');
        
        const data = await response.json();
        const info = JSON.parse(data.candidates[0].content.parts[0].text);
        
        let weatherText = 'Unavailable';
        let weatherEmoji = '❔';
        
        if (info.weather && info.weather.condition) {
            const condition = info.weather.condition.toLowerCase();
            if (condition.includes('sun') || condition.includes('clear')) weatherEmoji = '☀️';
            else if (condition.includes('cloud')) weatherEmoji = '☁️';
            else if (condition.includes('rain') || condition.includes('shower')) weatherEmoji = '🌧️';
            else if (condition.includes('storm')) weatherEmoji = '⛈️';
            else if (condition.includes('snow')) weatherEmoji = '❄️';
            else if (condition.includes('fog') || condition.includes('mist')) weatherEmoji = '🌫️';
            
            weatherText = `${info.weather.temp_f}°F / ${info.weather.temp_c}°C, ${info.weather.condition}`;
        }
        
        return {
            weather: { text: weatherText, emoji: weatherEmoji },
            timezone: info.timezone || null
        };
        
    } catch (error) {
        console.error("Could not fetch local info:", error);
        return { 
            weather: { text: 'Unavailable', emoji: '❔' }, 
            timezone: null 
        };
    }
}

async function fetchImages(query) {
    const url = `${CUSTOM_SEARCH_API_URL}?key=${GOOGLE_API_KEY}&cx=${CUSTOM_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&searchType=image&num=10`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Image search failed: ${response.status}`);
        
        const data = await response.json();
        if (!data.items) return [];
        
        return data.items.map(item => ({ type: 'image', url: item.link }));
        
    } catch (error) {
        console.error("Could not fetch images:", error);
        return [];
    }
}

async function fetchVideos(query) {
    const url = `${YOUTUBE_API_URL}?key=${YOUTUBE_API_KEY}&part=snippet&q=${encodeURIComponent(query + " tour")}&type=video&maxResults=5&videoEmbeddable=true`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`YouTube search failed: ${response.status}`);
        
        const data = await response.json();
        if (!data.items) return [];
        
        return data.items.map(item => ({ type: 'video', videoId: item.id.videoId }));
        
    } catch (error) {
        console.error("Could not fetch videos:", error);
        return [];
    }
}

async function fetchNewsOutlets(query) {
    const prompt = `List 3-4 major local news outlets for ${query}. Respond with valid JSON array of objects with "name" and "url" properties.`;
    
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    response_mime_type: "application/json"
                }
            }),
        });
        
        if (!response.ok) throw new Error('News API request failed');
        
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
        
    } catch (error) {
        console.error("Could not fetch news:", error);
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
    galleryTitle.textContent = `Image & Video Gallery: ${destination}`;
    galleryGrid.innerHTML = '';
    
    if (!items || items.length === 0) {
        galleryGrid.innerHTML = `<p class="text-slate-400 col-span-full text-center">No images or videos found.</p>`;
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

// --- 13. EVENT LISTENERS ---
generateTourButton.addEventListener('click', generateTour);
endTourButton.addEventListener('click', resetToMainMenu);
pauseTourButton.addEventListener('click', togglePause);
exploreButton.addEventListener('click', exploreCurrentLocation);
returnToTourButton.addEventListener('click', returnToMainTour);
window.addEventListener('resize', positionControls);

// Input validation
destinationInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    generateTourButton.disabled = !value;
});

console.log('Tour application loaded successfully');
