// --- 1. API KEY AND ENDPOINT CONFIGURATION ---
const GEMINI_API_KEY = 'AIzaSyDtLyUB-2wocE-uNG5e3pwNFArjn1GVTco'; // Your Gemini API Key
const GOOGLE_API_KEY = 'AIzaSyCYxnWpHNlzAz5h2W3pGTaW_oIP1ukTs1Y'; // Your Google Cloud API Key
const YOUTUBE_API_KEY = GOOGLE_API_KEY;
const CUSTOM_SEARCH_ENGINE_ID = '16b67ee3373714c2b';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const CUSTOM_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

// --- 2. DOM ELEMENT REFERENCES ---
// This code runs after the HTML document's elements have been created,
// because the script tag is at the end of the <body>.
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
// let placesService; // REMOVED - This service is deprecated.
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

/**
 * Shows a toast notification.
 * @param {string} text The message to display.
 * @param {'info' | 'success' | 'error'} type The type of toast.
 */
function showToast(text, type = 'info') {
    let backgroundColor;
    switch (type) {
        case 'error':
            backgroundColor = "linear-gradient(to right, #ef4444, #b91c1c)"; // Red
            break;
        case 'success':
            backgroundColor = "linear-gradient(to right, #22c55e, #15803d)"; // Green
            break;
        default: // info
            backgroundColor = "linear-gradient(to right, #0ea5e9, #0284c7)"; // Cyan/Blue
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


// --- 5. INITIALIZATION ---
// This function is attached to the window object so the global `initMap` function can call it.
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
    // placesService = new google.maps.places.PlacesService(streetviewContainer); // REMOVED - This service is deprecated.

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

// --- All other functions are defined below ---

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
    const R = 6371; // Radius of the Earth in km
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

async function exploreLocation() {
    const currentStop = tourItinerary[currentStopIndex];
    if (!currentStop) return;

    setLoading(true, `Looking for an inside view of ${currentStop.locationName}...`);

    try {
        // Step 1: Use the modern Places API to find the Place ID.
        const request = {
            textQuery: `${currentStop.locationName}, ${currentDestination}`,
            fields: ['id'], // The new API uses 'id' for the place ID.
            locationBias: currentStop.geometry.location,
        };

        const { places } = await google.maps.places.Place.searchByText(request);

        if (!places || places.length === 0 || !places[0].id) {
            throw new Error('Could not find a specific place matching the location.');
        }

        const placeId = places[0].id;

        // Step 2: Use StreetViewService to find an interior panorama.
        const panoData = await new Promise((resolve, reject) => {
            const streetViewService = new google.maps.StreetViewService();
            streetViewService.getPanorama({ placeId: placeId }, (data, status) => {
                if (status === 'OK') {
                    resolve(data);
                } else {
                    reject(new Error(`No interior panorama found. Status: ${status}`));
                }
            });
        });

        // Success! A panorama was found.
        originalStreetViewLocation = streetView.getLocation();
        streetView.setPano(panoData.location.pano);

        // Update the UI for "Explore Mode"
        exploreButton.style.display = 'none';
        pauseTourButton.style.display = 'none';
        returnToTourButton.style.display = 'flex';

    } catch (error) {
        console.error('Explore location error:', error.message);
        showToast("Sorry, an interior view isn't available for this location.", 'error');
    } finally {
        // IMPORTANT: Always turn off the loading indicator.
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
        currentStopIndex = 0;
        await processTourLoop();
    } catch (error) {
        console.error('Error generating tour:', error);
        showToast(`Failed to generate tour: ${error.message}`, 'error');
        setLoading(false);
        resetToMainMenu();
    }
}

async function processTourLoop() {
    while (currentStopIndex < tourItinerary.length) {
        const currentStop = tourItinerary[currentStopIndex];
        updateAddressLabel(currentStop.locationName);
        if (currentStopIndex === 0) {
            setLoading(true, `Going to the first stop: ${currentStop.locationName}`);
            await setStreetViewPosition(currentStop);
        } else {
            if (tourPaused) {
                await new Promise(resolve => { currentPauseResolve = resolve; });
            }
            const origin = tourItinerary[currentStopIndex - 1];
            await animateStreetView(origin, currentStop);
        }
        await processLocation(currentStop);
        currentStopIndex++;
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
    const locationName = stop.locationName;
    return new Promise(async (resolve) => {
        let targetLatLng;
        try {
            const geocodeResults = await new Promise((geoResolve) => {
                geocoder.geocode({ address: `${locationName}, ${currentDestination}` }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        geoResolve(results[0].geometry.location);
                    } else {
                        console.warn(`Geocoding failed for "${locationName}": ${status}. Falling back to Gemini's coordinates.`);
                        geoResolve(new google.maps.LatLng(stop.geometry.location.lat, stop.geometry.location.lng));
                    }
                });
            });
            targetLatLng = geocodeResults;
        } catch (error) {
            console.error("Error during initial geocoding:", error);
            targetLatLng = new google.maps.LatLng(stop.geometry.location.lat, stop.geometry.location.lng);
        }
        if (!targetLatLng) {
            console.error(`Invalid targetLatLng for ${locationName}.`);
            resolve();
            return;
        }
        const streetViewService = new google.maps.StreetViewService();
        streetViewService.getPanorama({
            location: targetLatLng,
            radius: 500,
            source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
            if (status === 'OK') {
                streetView.setPosition(data.location.latLng);
            } else {
                streetView.setPosition(targetLatLng);
            }
            resolve();
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
        3. "geometry": An object containing a "location" object with "lat" and "lng" coordinates.
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
            // Fixed the YouTube embed URL
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