
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
let tourState = 'setup'; // 'setup', 'touring', 'paused', 'exploring', 'gallery'
let currentUtterance = null;
let exploreLocation = null;
let tourInProgress = false;
let autoAdvanceTimeout = null;

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
    if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
    }
}

// --- 5. INITIALIZATION ---
window.initializeTourApp = () => {
    try {
        // Initialize Google Maps services using new API patterns
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
        
        console.log('Tour app initialized successfully');
    } catch (error) {
        console.error('Initialization failed:', error);
        showToast('Failed to initialize Google Maps. Please refresh the page.', 'error');
    }
};

// --- 6. MODERN LOCATION FINDING SYSTEM ---
async function findLocationUsingGeocoding(locationName, cityName) {
    const searchQuery = `${locationName}, ${cityName}`;
    
    return new Promise((resolve, reject) => {
        geocoder.geocode({ address: searchQuery }, (results, status) => {
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

async function findStreetViewLocation(coordinates, locationName, maxRadius = 150) {
    const position = new google.maps.LatLng(coordinates.lat, coordinates.lng);
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Street View search timed out for ${locationName}`));
        }, 10000);
        
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
                    panoId: data.location.pano,
                    hasStreetView: true
                });
            } else {
                console.warn(`No Street View found for ${locationName}, using original coordinates`);
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

// --- 7. IMPROVED TOUR GENERATION ---
async function generateTour() {
    currentDestination = destinationInput.value.trim();
    const selectedFocus = tourFocus.value;
    
    if (!currentDestination) {
        showToast('Please enter a destination city.', 'error');
        return;
    }
    
    // Reset all state
    resetTourState();
    tourState = 'touring';
    tourInProgress = true;
    
    toggleVisibility(tourSetupContainer, false);
    
    try {
        setLoading(true, `Creating ${selectedFocus} tour for ${currentDestination}...`);
        
        // Generate itinerary with better error handling
        const rawItinerary = await fetchItinerary(currentDestination, selectedFocus);
        
        if (!rawItinerary || rawItinerary.length === 0) {
            throw new Error('Failed to generate tour itinerary');
        }
        
        // Process and validate each location
        setLoading(true, 'Finding precise locations and street views...');
        tourItinerary = await processItinerary(rawItinerary, currentDestination);
        
        if (tourItinerary.length === 0) {
            throw new Error('No valid locations found for this tour. Please try a different destination.');
        }
        
        console.log(`Successfully processed ${tourItinerary.length} locations for tour`);
        
        // Initialize tour UI
        await initializeTourUI();
        
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
            // Find coordinates using modern geocoding
            const locationData = await findLocationUsingGeocoding(stop.locationName, cityName);
            
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
                hasStreetView: streetViewData.hasStreetView,
                formattedAddress: locationData.formattedAddress,
                method: locationData.method
            });
            
            console.log(`✓ Processed: ${stop.locationName} (Street View: ${streetViewData.hasStreetView})`);
            
        } catch (error) {
            console.warn(`✗ Failed to process: ${stop.locationName} - ${error.message}`);
            // Don't show toast for individual failures to avoid spam
        }
    }
    
    return processedStops;
}

// --- 8. TOUR UI INITIALIZATION ---
async function initializeTourUI() {
    // Show street view container
    toggleVisibility(streetviewContainer, true);
    streetView.setVisible(true);
    
    // Show controls
    toggleVisibility(controlsContainer, true);
    positionControls();
    
    // Initialize control states
    resetControlStates();
    
    console.log('Tour UI initialized');
}

function resetControlStates() {
    exploreButton.style.display = 'flex';
    returnToTourButton.style.display = 'none';
    pauseTourButton.style.display = 'flex';
    
    pauseIcon.textContent = '⏸️';
    pauseText.textContent = 'Pause Tour';
    pauseTourButton.className = 'bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-red-400 transition-colors duration-300 flex items-center gap-2';
}

// --- 9. TOUR EXECUTION ---
async function startTour() {
    if (tourItinerary.length === 0) {
        throw new Error('No valid stops in itinerary');
    }
    
    currentStopIndex = 0;
    await moveToStop(tourItinerary[0]);
    
    // Start the tour loop
    tourState = 'touring';
    await runTourLoop();
}

async function runTourLoop() {
    while (currentStopIndex < tourItinerary.length && tourInProgress) {
        const currentStop = tourItinerary[currentStopIndex];
        
        // Present the current location
        await presentLocation(currentStop);
        
        // Auto-pause at each location for user interaction
        tourState = 'paused';
        updatePauseButton();
        
        // Wait for user to continue
        await waitForUserAction();
        
        // Check if tour is still in progress
        if (!tourInProgress) break;
        
        // Check if we're at the last stop
        if (currentStopIndex === tourItinerary.length - 1) {
            // Tour completed
            await completeTour();
            break;
        }
        
        // Move to next stop
        const nextStopIndex = currentStopIndex + 1;
        const nextStop = tourItinerary[nextStopIndex];
        
        if (nextStop) {
            setLoading(true, `Traveling to ${nextStop.locationName}...`);
            await travelToStop(currentStop, nextStop);
            currentStopIndex = nextStopIndex;
        }
    }
}

async function moveToStop(stop) {
    try {
        const position = new google.maps.LatLng(stop.streetViewCoordinates.lat, stop.streetViewCoordinates.lng);
        
        if (stop.panoId && stop.hasStreetView) {
            streetView.setPano(stop.panoId);
        } else {
            streetView.setPosition(position);
        }
        
        // Set a reasonable view
        streetView.setPov({ heading: 0, pitch: 0 });
        streetView.setZoom(1);
        
        updateAddressLabel(stop.locationName);
        
        console.log(`Moved to: ${stop.locationName}`);
        
    } catch (error) {
        console.error(`Error moving to ${stop.locationName}:`, error);
        throw error;
    }
}

async function presentLocation(location) {
    try {
        // Stop any current speech
        stopSpeech();
        
        // Show subtitle
        const subtitle = `${location.locationName}: ${location.briefDescription}`;
        subtitlesContainer.textContent = subtitle;
        toggleVisibility(tourInfoContainer, true);
        
        // Update controls for current location
        exploreButton.style.display = 'flex';
        returnToTourButton.style.display = 'none';
        pauseTourButton.style.display = 'flex';
        
        // Speak the description
        await speakLocationDescription(location);
        
    } catch (error) {
        console.error(`Error presenting location ${location.locationName}:`, error);
        toggleVisibility(tourInfoContainer, false);
    }
}

async function speakLocationDescription(location) {
    if ('speechSynthesis' in window) {
        const text = `Welcome to ${location.locationName}. ${location.briefDescription}. You can explore this area or continue to the next location.`;
        
        return new Promise((resolve) => {
            currentUtterance = new SpeechSynthesisUtterance(text);
            currentUtterance.rate = 0.9;
            currentUtterance.pitch = 1.1;
            
            currentUtterance.onend = () => {
                toggleVisibility(tourInfoContainer, false);
                currentUtterance = null;
                resolve();
            };
            
            currentUtterance.onerror = () => {
                toggleVisibility(tourInfoContainer, false);
                currentUtterance = null;
                resolve();
            };
            
            synth.speak(currentUtterance);
            
            // Fallback timeout
            autoAdvanceTimeout = setTimeout(() => {
                if (currentUtterance) {
                    synth.cancel();
                    toggleVisibility(tourInfoContainer, false);
                    currentUtterance = null;
                    resolve();
                }
            }, 15000);
        });
    } else {
        // Fallback for browsers without speech synthesis
        return new Promise((resolve) => {
            setTimeout(() => {
                toggleVisibility(tourInfoContainer, false);
                resolve();
            }, 5000);
        });
    }
}

async function travelToStop(fromStop, toStop) {
    return new Promise((resolve) => {
        try {
            const fromPosition = new google.maps.LatLng(fromStop.streetViewCoordinates.lat, fromStop.streetViewCoordinates.lng);
            const toPosition = new google.maps.LatLng(toStop.streetViewCoordinates.lat, toStop.streetViewCoordinates.lng);
            
            // Smooth transition animation
            const steps = 40;
            let currentStep = 0;
            
            const animate = () => {
                if (currentStep >= steps) {
                    // Final positioning
                    moveToStop(toStop).then(resolve).catch(resolve);
                    return;
                }
                
                const progress = easeInOutCubic(currentStep / steps);
                const lat = fromPosition.lat() + (toPosition.lat() - fromPosition.lat()) * progress;
                const lng = fromPosition.lng() + (toPosition.lng() - fromPosition.lng()) * progress;
                
                streetView.setPosition(new google.maps.LatLng(lat, lng));
                
                currentStep++;
                setTimeout(animate, 80);
            };
            
            animate();
            
        } catch (error) {
            console.error('Error during travel animation:', error);
            resolve();
        }
    });
}

// Easing function for smooth animations
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

// --- 10. TOUR CONTROLS ---
async function waitForUserAction() {
    return new Promise((resolve) => {
        const checkState = () => {
            if (tourState === 'touring' || !tourInProgress) {
                resolve();
            } else {
                setTimeout(checkState, 200);
            }
        };
        checkState();
    });
}

function updatePauseButton() {
    if (currentStopIndex === tourItinerary.length - 1) {
        // Last stop - show end tour option
        pauseIcon.textContent = '🏁';
        pauseText.textContent = 'End Tour';
        pauseTourButton.className = 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-2 px-4 rounded-lg shadow-lg border border-cyan-400 transition-colors duration-300 flex items-center gap-2';
    } else {
        // Regular pause state
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Continue Tour';
        pauseTourButton.className = 'bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-green-400 transition-colors duration-300 flex items-center gap-2';
    }
}

function togglePause() {
    if (tourState === 'paused') {
        if (currentStopIndex === tourItinerary.length - 1) {
            // End tour
            completeTour();
        } else {
            // Continue tour
            tourState = 'touring';
            pauseIcon.textContent = '⏸️';
            pauseText.textContent = 'Pause Tour';
            pauseTourButton.className = 'bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-red-400 transition-colors duration-300 flex items-center gap-2';
            exploreButton.style.display = 'none';
        }
    } else if (tourState === 'touring') {
        // Pause tour
        tourState = 'paused';
        updatePauseButton();
        exploreButton.style.display = 'flex';
    }
}

async function exploreCurrentLocation() {
    if (tourState !== 'paused' || currentStopIndex >= tourItinerary.length) return;
    
    const currentStop = tourItinerary[currentStopIndex];
    tourState = 'exploring';
    exploreLocation = streetView.getPosition();
    
    setLoading(true, `Exploring ${currentStop.locationName}...`);
    
    try {
        // Try to find a different view or closer position
        const betterView = await findBetterView(currentStop);
        
        if (betterView) {
            if (betterView.panoId) {
                streetView.setPano(betterView.panoId);
            } else {
                streetView.setPosition(new google.maps.LatLng(betterView.lat, betterView.lng));
            }
            showToast('Found a different view of this location!', 'success');
        } else {
            // Just adjust the view angle
            const currentPov = streetView.getPov();
            streetView.setPov({
                heading: (currentPov.heading + 90) % 360,
                pitch: currentPov.pitch + 10
            });
            showToast('Adjusted view angle', 'info');
        }
        
        // Update UI for explore mode
        exploreButton.style.display = 'none';
        pauseTourButton.style.display = 'none';
        returnToTourButton.style.display = 'flex';
        
    } catch (error) {
        showToast('Exploration complete', 'info');
        tourState = 'paused';
    } finally {
        setLoading(false);
    }
}

async function findBetterView(stop) {
    try {
        // Try to find a panorama within a smaller radius for a different perspective
        const position = new google.maps.LatLng(stop.coordinates.lat, stop.coordinates.lng);
        
        return new Promise((resolve) => {
            streetViewService.getPanorama({
                location: position,
                radius: 75,
                source: google.maps.StreetViewSource.OUTDOOR
            }, (data, status) => {
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
        // Return to current stop position
        moveToStop(tourItinerary[currentStopIndex]);
    }
    
    tourState = 'paused';
    returnToTourButton.style.display = 'none';
    exploreButton.style.display = 'flex';
    pauseTourButton.style.display = 'flex';
}

// --- 11. TOUR COMPLETION ---
async function completeTour() {
    tourInProgress = false;
    tourState = 'gallery';
    stopSpeech();
    
    setLoading(true, 'Tour completed! Creating your photo gallery...');
    
    try {
        await showFinalGallery(currentDestination);
    } catch (error) {
        console.error('Error showing final gallery:', error);
        showToast('Tour completed! Gallery could not be loaded.', 'info');
        resetToMainMenu();
    }
}

// --- 12. ITINERARY FETCHING ---
async function fetchItinerary(destination, focus) {
    const prompt = `
        Create a 5-stop virtual tour itinerary for "${destination}" with focus on "${focus}".
        
        For each stop, provide:
        1. "locationName": Specific landmark/attraction name (be very specific with exact names)
        2. "briefDescription": One engaging sentence about this location
        
        Make sure locations are well-known, publicly accessible places that would have Street View coverage.
        
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
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid API response format');
        }
        
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
        
        console.log(`Generated itinerary with ${itinerary.length} stops`);
        return itinerary;
        
    } catch (error) {
        console.error('Failed to fetch itinerary:', error);
        throw new Error(`Could not generate tour: ${error.message}`);
    }
}

// --- 13. UI HELPERS ---
function positionControls() {
    if (controlsContainer && window.innerHeight) {
        controlsContainer.style.bottom = '120px';
        controlsContainer.style.right = '16px';
    }
}

function resetTourState() {
    stopSpeech();
    if (localTimeInterval) clearInterval(localTimeInterval);
    
    tourInProgress = false;
    tourState = 'setup';
    destinationTimezone = null;
    currentStopIndex = 0;
    exploreLocation = null;
    tourItinerary = [];
}

function resetToMainMenu() {
    resetTourState();
    
    // Reset UI
    toggleVisibility(galleryContainer, false);
    toggleVisibility(streetviewContainer, false);
    toggleVisibility(addressLabel, false);
    toggleVisibility(controlsContainer, false);
    toggleVisibility(tourInfoContainer, false);
    
    if (streetView) {
        streetView.setVisible(false);
    }
    
    // Reset form
    destinationInput.value = '';
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Tour';
    toggleVisibility(tourSetupContainer, true);
    
    // Clear gallery
    if (galleryGrid) {
        galleryGrid.innerHTML = '';
    }
    
    setLoading(false);
    console.log('Reset to main menu');
}

// --- 14. GALLERY AND LOCAL INFO (Simplified) ---
async function showFinalGallery(destination) {
    toggleVisibility(streetviewContainer, false);
    if (streetView) streetView.setVisible(false);
    toggleVisibility(controlsContainer, false);
    toggleVisibility(addressLabel, false);
    toggleVisibility(tourInfoContainer, false);
    
    try {
        const [images, videos, localInfo] = await Promise.all([
            fetchImages(destination).catch(() => []),
            fetchVideos(destination).catch(() => []),
            fetchLocalInfo(destination).catch(() => ({ weather: { text: 'Unavailable', emoji: '❔' }, timezone: null }))
        ]);
        
        // Update local information
        if (localInfo.timezone) {
            destinationTimezone = localInfo.timezone;
            updateLocalTime(localTime);
        } else {
            localTime.textContent = new Date().toLocaleTimeString();
        }
        
        if (localInfo.weather) {
            localWeather.textContent = `${localInfo.weather.emoji} ${localInfo.weather.text}`;
        }
        
        // Fetch news separately to avoid blocking
        fetchNewsOutlets(destination).then(news => {
            populateNews(news, localNews);
        }).catch(() => {
            localNews.innerHTML = '<p class="text-slate-400">News unavailable</p>';
        });
        
        // Combine gallery items
        const galleryItems = [...images, ...videos];
        galleryItems.sort(() => Math.random() - 0.5);
        
        populateGalleryGrid(galleryItems, destination);
        
        setLoading(false);
        toggleVisibility(galleryContainer, true);
        
    } catch (error) {
        console.error("Failed to create gallery:", error);
        setLoading(false);
        showToast(`Gallery loaded with limited content`, 'info');
        
        // Show gallery anyway with minimal content
        galleryTitle.textContent = `Tour Complete: ${destination}`;
        galleryGrid.innerHTML = '<p class="text-slate-400 col-span-full text-center">Gallery content unavailable</p>';
        toggleVisibility(galleryContainer, true);
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
    const url = `${CUSTOM_SEARCH_API_URL}?key=${GOOGLE_API_KEY}&cx=${CUSTOM_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&searchType=image&num=8`;
    
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
    const url = `${YOUTUBE_API_URL}?key=${YOUTUBE_API_KEY}&part=snippet&q=${encodeURIComponent(query + " tour")}&type=video&maxResults=4&videoEmbeddable=true`;
    
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

// --- 15. EVENT LISTENERS ---
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (tourState === 'paused') {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            togglePause();
        }
    }
});

console.log('Rewritten tour application loaded successfully');
