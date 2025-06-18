// --- 1. API KEY AND ENDPOINT CONFIGURATION ---
const GEMINI_API_KEY = 'AIzaSyDtLyUB-2wocE-uNG5e3pwNFArjn1GVTco'; // Your Gemini API Key
const GOOGLE_API_KEY = 'AIzaSyCYxnWpHNlzAz5h2W3pGTaW_oIP1ukTs1Y'; // Your Google Cloud API Key
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
let directionsService;
let geocoder;
let streetViewService;
let tourItinerary = [];
let currentStopIndex = 0;
let synth = window.speechSynthesis;
let currentDestination = '';
let localTimeInterval = null;
let destinationTimezone = null;
let tourPaused = false;
let currentPauseResolve = null;
let originalStreetViewLocation = null;

// --- 4. UTILITY FUNCTIONS ---
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

function updateExploreUI() {
    exploreButton.style.display = 'none';
    pauseTourButton.style.display = 'none';
    returnToTourButton.style.display = 'flex';
}

// --- 5. INITIALIZATION ---
window.initializeTourApp = () => {
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
    directionsService = new google.maps.DirectionsService();
    geocoder = new google.maps.Geocoder();
    streetViewService = new google.maps.StreetViewService();
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Tour';
};

// --- EVENT LISTENERS ---
generateTourButton.addEventListener('click', generateTour);
endTourButton.addEventListener('click', resetToMainMenu);
pauseTourButton.addEventListener('click', togglePause);
exploreButton.addEventListener('click', exploreLocation);
returnToTourButton.addEventListener('click', returnToTour);
window.addEventListener('resize', positionControls);

// --- APP LOGIC ---
function positionControls() {
    const tourInfo = document.getElementById('tour-information');
    if (tourInfo && controlsContainer) {
        const tourInfoRect = tourInfo.getBoundingClientRect();
        const tourInfoTop = tourInfoRect.top + window.scrollY;
        controlsContainer.style.bottom = `${window.innerHeight - tourInfoTop + 10}px`;
        controlsContainer.style.right = '16px';
    }
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

function getDistanceInKm(latLng1, latLng2) {
    const R = 6371;
    const dLat = (latLng2.lat - latLng1.lat) * Math.PI / 180;
    const dLon = (latLng2.lng - latLng1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(latLng1.lat * Math.PI / 180) * Math.cos(latLng2.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function updateLocalTime(element) {
    if (localTimeInterval) clearInterval(localTimeInterval);
    localTimeInterval = setInterval(() => {
        if (destinationTimezone) {
            element.textContent = new Date().toLocaleTimeString('en-US', { timeZone: destinationTimezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } else {
            element.textContent = new Date().toLocaleTimeString();
        }
    }, 1000);
}

function updateAddressLabel(locationName) {
    currentAddress.textContent = locationName;
}

function resetToMainMenu() {
    if (localTimeInterval) clearInterval(localTimeInterval);
    destinationTimezone = null;
    tourPaused = false;
    toggleVisibility(galleryContainer, false);
    toggleVisibility(streetviewContainer, false);
    toggleVisibility(addressLabel, false);
    toggleVisibility(controlsContainer, false);
    streetView.setVisible(false);
    toggleVisibility(tourInfoContainer, false);
    destinationInput.value = '';
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Another Tour';
    toggleVisibility(tourSetupContainer, true);
    galleryGrid.innerHTML = '';
    originalStreetViewLocation = null;
}

function togglePause() {
    tourPaused = !tourPaused;
    if (tourPaused) {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Resume Tour';
        pauseTourButton.className = 'bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-green-400 transition-colors duration-300 flex items-center gap-2';
    } else {
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'Pause Tour';
        pauseTourButton.className = 'bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-lg shadow-lg border border-red-400 transition-colors duration-300 flex items-center gap-2';
        exploreButton.style.display = 'none';
        if (currentPauseResolve) {
            currentPauseResolve();
            currentPauseResolve = null;
        }
    }
}

// Your fixed version of exploreLocation
async function exploreLocation() {
    const currentStop = tourItinerary[currentStopIndex];
    if (!currentStop) return;

    setLoading(true, `Looking for an inside view of ${currentStop.locationName}...`);

    // Use the specific 'explore' coordinates if available, otherwise fall back to the main 'geometry' coordinates.
    const exploreLocationCoords = currentStop.explore?.location || currentStop.geometry.location;

    try {
        // --- Attempt 1: Find an INDOOR panorama (best case) ---
        try {
            const location = new google.maps.LatLng(exploreLocationCoords.lat, exploreLocationCoords.lng);
            const panoData = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error("Indoor search timed out")), 7000);
                streetViewService.getPanorama({
                    location: location,
                    radius: 50,
                    source: google.maps.StreetViewSource.INDOOR
                }, (data, status) => {
                    clearTimeout(timeoutId);
                    if (status === 'OK') resolve(data);
                    else reject(new Error(`No indoor panorama found. Status: ${status}`));
                });
            });
            originalStreetViewLocation = streetView.getLocation();
            streetView.setPano(panoData.location.pano);
            updateExploreUI();
            return; // Success!
        } catch (error) {
            console.warn("Attempt 1 (Indoor) Failed:", error.message);
        }

        // --- Attempt 2: Find ANY panorama using the Place ID (fallback) ---
        try {
            const request = {
                textQuery: `${currentStop.locationName}, ${currentDestination}`,
                fields: ['id'],
                locationBias: exploreLocationCoords,
            };
            const { places } = await google.maps.places.Place.searchByText(request);
            if (!places || places.length === 0 || !places[0].id) throw new Error("Could not find Place ID.");

            const placeId = places[0].id;
            const panoData = await new Promise((resolve, reject) => {
                 const timeoutId = setTimeout(() => reject(new Error("Place ID search timed out")), 7000);
                 streetViewService.getPanorama({ placeId }, (data, status) => {
                    clearTimeout(timeoutId);
                    if (status === 'OK') resolve(data);
                    else reject(new Error(`No panorama for Place ID. Status: ${status}`));
                });
            });
            originalStreetViewLocation = streetView.getLocation();
            streetView.setPano(panoData.location.pano);
            updateExploreUI();
            return; // Success!
        } catch (error) {
            console.warn("Attempt 2 (Place ID) Failed:", error.message);
        }

        // --- If all attempts fail ---
        showToast("Sorry, a specific interior view isn't available for this location.", 'error');

    } finally {
        setLoading(false);
    }
}

function returnToTour() {
    if (originalStreetViewLocation) {
        streetView.setPosition(originalStreetViewLocation.latLng);
        originalStreetViewLocation = null;
    }
    returnToTourButton.style.display = 'none';
    exploreButton.style.display = 'flex';
    pauseTourButton.style.display = 'flex';
}

// Corrected generateTour logic
async function generateTour() {
    currentDestination = destinationInput.value.trim();
    const selectedFocus = tourFocus.value;
    if (!currentDestination) {
        showToast('Please enter a destination city.', 'error');
        return;
    }
    toggleVisibility(tourSetupContainer, false);
    try {
        tourItinerary = await fetchItinerary(currentDestination, selectedFocus);
        if (!tourItinerary || tourItinerary.length === 0) {
            throw new Error("The generated itinerary is empty.");
        }
        toggleVisibility(streetviewContainer, true);
        streetView.setVisible(true);
        toggleVisibility(controlsContainer, true);
        positionControls();
        toggleVisibility(addressLabel, true);
        exploreButton.style.display = 'none';
        returnToTourButton.style.display = 'none';

        // --- NEW: Find the best starting point using Place Search for the first stop ---
        setLoading(true, `Finding the best starting point for ${tourItinerary[0].locationName}...`);
        try {
            const firstStopName = tourItinerary[0].locationName;
            const request = {
                textQuery: `${firstStopName}, ${currentDestination}`,
                fields: ['id'],
            };
            const { places } = await google.maps.places.Place.searchByText(request);
            if (!places || places.length === 0 || !places[0].id) {
                throw new Error("Could not find a specific Place ID for the first stop.");
            }
            // Use the new helper to set the view to the precise Place ID panorama
            await setStreetViewToPlaceId(places[0].id);

        } catch (error) {
            console.warn(`Could not find iconic starting point: ${error.message}. Defaulting to itinerary coordinates.`);
            // Fallback to the old method if the new one fails
            await setStreetViewPosition(tourItinerary[0]);
        }

        // --- The rest of the tour starts here ---
        currentStopIndex = 0;
        await processTourLoop();

    } catch (error) {
        console.error('Error generating tour:', error);
        showToast(`Failed to generate tour: ${error.message}`, 'error');
        setLoading(false);
        resetToMainMenu();
    }
}

// Corrected tour loop logic
async function processTourLoop() {
    while (currentStopIndex < tourItinerary.length) {
        const currentStop = tourItinerary[currentStopIndex];
        const isLastStop = currentStopIndex === tourItinerary.length - 1;

        updateAddressLabel(currentStop.locationName);
        await processLocation(currentStop);

        if (isLastStop) {
            pauseIcon.textContent = '🏁';
            pauseText.textContent = 'End Tour';
            pauseTourButton.className = 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-2 px-4 rounded-lg shadow-lg border border-cyan-400 transition-colors duration-300 flex items-center gap-2';
        }

        await new Promise(resolve => { currentPauseResolve = resolve; });

        if (isLastStop) {
            break;
        }

        const origin = tourItinerary[currentStopIndex];
        currentStopIndex++;
        const destination = tourItinerary[currentStopIndex];
        await animateStreetView(origin, destination);
    }

    setLoading(true, 'Tour Complete! Curating gallery...');
    await showFinalGallery(currentDestination);
}

async function processLocation(location) {
    setLoading(false);
    synth.cancel();
    subtitlesContainer.textContent = `${location.locationName}: ${location.briefDescription}`;
    toggleVisibility(tourInfoContainer, true);
    positionControls();
    if (!tourPaused) {
        togglePause();
    }
    exploreButton.style.display = 'flex';
    returnToTourButton.style.display = 'none';
    pauseTourButton.style.display = 'flex';
    return new Promise((resolve) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(`We have arrived at ${location.locationName}. ${location.briefDescription}. You can now explore the area or resume the tour.`);
            utterance.rate = 0.9;
            utterance.pitch = 1.1;
            synth.speak(utterance);
            utterance.onend = () => {
                toggleVisibility(tourInfoContainer, false);
            };
        } else {
            setTimeout(() => {
                toggleVisibility(tourInfoContainer, false);
            }, 5000);
        }
        resolve();
    });
}

async function setStreetViewPosition(stop) {
    // This function will now always resolve to prevent the tour from hanging.
    return new Promise((resolve) => {
        const targetLatLng = new google.maps.LatLng(stop.geometry.location.lat, stop.geometry.location.lng);

        if (!targetLatLng.lat() || !targetLatLng.lng()) {
            console.error(`Invalid LatLng provided for ${stop.locationName}.`);
            resolve();
            return;
        }

        // Set a 7-second timeout for the panorama search.
        const timeoutId = setTimeout(() => {
            console.warn(`Panorama search timed out for ${stop.locationName}. Placing camera at exact coordinates.`);
            streetView.setPosition(targetLatLng); // Place camera at the coordinates on timeout
            resolve(); // Resolve the promise to allow the app to continue
        }, 7000);

        streetViewService.getPanorama({
            location: targetLatLng,
            radius: 50,
            source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
            clearTimeout(timeoutId); // Clear the timeout once a response is received

            if (status === 'OK') {
                // Panorama found, move the camera there.
                streetView.setPosition(data.location.latLng);
            } else {
                // If no panorama is found, place the camera at the exact coordinates.
                console.warn(`Could not find Street View panorama for ${stop.locationName}. Placing camera at exact coordinates.`);
                streetView.setPosition(targetLatLng);
            }
            resolve(); // Signal that positioning is complete.
        });
    });
}

async function animateStreetView(originStop, destinationStop) {
    const originName = originStop.locationName;
    const destinationName = destinationStop.locationName;
    setLoading(true, `Traveling from ${originName} to ${destinationName}...`);
    const originLocation = new google.maps.LatLng(originStop.geometry.location.lat, originStop.geometry.location.lng);
    const destinationLocation = new google.maps.LatLng(destinationStop.geometry.location.lat, destinationStop.geometry.location.lng);
    const distance = getDistanceInKm(originStop.geometry.location, destinationStop.geometry.location);
    const travelMode = await getTravelMode(originName, destinationName, distance);
    return new Promise((resolve) => {
        directionsService.route({
            origin: originLocation,
            destination: destinationLocation,
            travelMode: google.maps.TravelMode[travelMode]
        }, (response, status) => {
            if (status !== 'OK') {
                console.error(`Directions request failed: ${status}. Using fallback positioning.`);
                // Inform the user about the teleport
                showToast(`Could not calculate a route. Teleporting to ${destinationName}!`, 'info');
                setStreetViewPosition(destinationStop).then(resolve);
                return;
            }
            const path = response.routes[0].overview_path;
            let step = 0;
            const animate = () => {
                if (tourPaused) {
                    currentPauseResolve = () => {
                        currentPauseResolve = null;
                        animate();
                    };
                    return;
                }
                if (step >= path.length) {
                    setStreetViewPosition(destinationStop).then(resolve);
                    return;
                }
                streetView.setPosition(path[step]);
                const timeout = travelMode === 'WALKING' ? 100 : 40;
                setTimeout(animate, timeout);
                step++;
            };
            animate();
        });
    });
}

async function fetchItinerary(destination, focus) {
    setLoading(true, `Generating ${focus} tour for ${destination}...`);
    const prompt = `
        You are a virtual tour guide. Create a 5-stop virtual tour itinerary for the city: "${destination}".
        The tour focus is: "${focus}".
        For each stop, provide the following information in a valid JSON format:
        1. "locationName": The name of the landmark or place.
        2. "briefDescription": A concise, one-sentence interesting fact or description suitable for a tour guide to say upon arrival.
        3. "geometry": An object containing a "location" object with the best publicly accessible lat/lng coordinates for ARRIVING at the location (e.g., the main entrance, trailhead, or parking lot). This is for the travel part of the tour.
        4. "explore": (Optional) An object with a "location" containing the lat/lng coordinates for the MOST ICONIC VIEWPOINT or interior panorama associated with the stop (e.g., a summit view, an exhibition hall). Only include this if a distinct, well-known viewpoint exists.
        IMPORTANT: Respond with ONLY the valid JSON array of objects. Do not include any other text, markdown, or explanation.
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
        if (!response.ok) throw new Error(`The AI tour guide is currently unavailable (API Error: ${response.status})`);
        const data = await response.json();
        const itinerary = JSON.parse(data.candidates[0].content.parts[0].text);
        if (!Array.isArray(itinerary) || itinerary.length === 0) {
            throw new Error("The AI guide couldn't create an itinerary for this location.");
        }
        itinerary.forEach((stop, index) => {
            if (!stop.locationName || !stop.briefDescription || !stop.geometry || !stop.geometry.location || !stop.geometry.location.lat || !stop.geometry.location.lng) {
                throw new Error(`The AI guide returned an invalid itinerary (stop ${index} is malformed).`);
            }
        });
        return itinerary;
    } catch (error) {
        console.error('Failed to fetch or parse itinerary:', error);
        throw new Error(error.message || "Could not generate the tour itinerary.");
    }
}

async function fetchLocalInfo(query) {
    const prompt = `Provide local information for ${query}. Respond with a single, valid JSON object containing "weather" (an object with "temp_c", "temp_f", and "condition") and "timezone" (the IANA timezone name string, e.g., "America/New_York").`;
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
        return { weather: { text: 'Unavailable', emoji: '❔' }, timezone: null };
    }
}

async function getTravelMode(originName, destinationName, distanceKm) {
    const prompt = `You are a travel planner. Choose the best travel mode. Origin: "${originName}". Destination: "${destinationName}". Distance: ${distanceKm.toFixed(2)} km. If the distance is very short (under 2 km) and in a city, prefer 'WALKING'. Otherwise, 'DRIVING'. Respond with only the single word: 'DRIVING' or 'WALKING'.`;
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1 }
            }),
        });
        if (!response.ok) throw new Error(`Gemini API request failed`);
        const data = await response.json();
        const choice = data.candidates[0].content.parts[0].text.trim().toUpperCase();
        return (choice === 'DRIVING' || choice === 'WALKING') ? choice : 'DRIVING';
    } catch (error) {
        console.error('Error getting travel mode:', error);
        return 'DRIVING';
    }
}

async function showFinalGallery(destination) {
    toggleVisibility(streetviewContainer, false);
    streetView.setVisible(false);
    toggleVisibility(controlsContainer, false);
    toggleVisibility(addressLabel, false);
    setLoading(true, 'Curating gallery and local information...');
    try {
        const [images, videos, localInfo, news] = await Promise.all([
            fetchImages(destination),
            fetchVideos(destination),
            fetchLocalInfo(destination),
            fetchNewsOutlets(destination)
        ]);
        destinationTimezone = localInfo.timezone;
        updateLocalTime(localTime);
        if (localInfo.weather) {
            localWeather.textContent = `${localInfo.weather.emoji} ${localInfo.weather.text}`;
        }
        populateNews(news, localNews);
        const galleryItems = [...images, ...videos];
        galleryItems.sort(() => Math.random() - 0.5);
        populateGalleryGrid(galleryItems, destination);
        setLoading(false);
        toggleVisibility(galleryContainer, true);
    } catch (error) {
        console.error("Failed to create gallery:", error);
        setLoading(false);
        showToast(`Sorry, we couldn't create a gallery for ${destination}.`, 'error');
        resetToMainMenu();
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
        if (!response.ok) throw new Error(`Youtube failed: ${response.status}`);
        const data = await response.json();
        if (!data.items) return [];
        return data.items.map(item => ({ type: 'video', videoId: item.id.videoId }));
    } catch (error) {
        console.error("Could not fetch videos:", error);
        return [];
    }
}

async function fetchNewsOutlets(query) {
    const prompt = `List the top 3-4 local news outlets for ${query}. Provide only a valid JSON array of objects, where each object has "name" and "url".`;
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