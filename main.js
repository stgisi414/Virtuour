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
const tourFocus = document.getElementById('tourFocus'); // <-- ADDED
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

// --- 3. GLOBAL VARIABLES ---
let streetView;
let directionsService;
let geocoder;
let tourItinerary = [];
let currentStopIndex = 0;
let synth = window.speechSynthesis;
let currentDestination = '';
let localTimeInterval = null; // For the clock

// --- 4. INITIALIZATION ---
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

    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Tour';
};

generateTourButton.addEventListener('click', generateTour);
endTourButton.addEventListener('click', resetToMainMenu);


// --- 5. HELPER FUNCTIONS ---
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

function updateLocalTime(element) {
    if (localTimeInterval) clearInterval(localTimeInterval);
    localTimeInterval = setInterval(() => {
        element.textContent = new Date().toLocaleTimeString();
    }, 1000);
}

function getDistanceInKm(latLng1, latLng2) {
    const R = 6371;
    const dLat = (latLng2.lat() - latLng1.lat()) * Math.PI / 180;
    const dLon = (latLng2.lng() - latLng1.lng()) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(latLng1.lat() * Math.PI / 180) * Math.cos(latLng2.lat() * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function resetToMainMenu() {
    if (localTimeInterval) clearInterval(localTimeInterval); // Stop clock
    toggleVisibility(galleryContainer, false);
    toggleVisibility(streetviewContainer, false); 
    streetView.setVisible(false);
    toggleVisibility(tourInfoContainer, false);

    destinationInput.value = '';
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Another Tour';
    toggleVisibility(tourSetupContainer, true);
    galleryGrid.innerHTML = ''; 
}


// --- 6. CORE TOUR LOGIC ---

async function generateTour() {
    currentDestination = destinationInput.value.trim();
    const selectedFocus = tourFocus.value; // <-- ADDED
    if (!currentDestination) {
        alert('Please enter a destination city.');
        return;
    }

    toggleVisibility(tourSetupContainer, false);

    try {
        // Pass the selected focus to the itinerary fetcher
        tourItinerary = await fetchItinerary(currentDestination, selectedFocus); // <-- MODIFIED
        if (!tourItinerary || tourItinerary.length === 0) {
            throw new Error("The generated itinerary is empty.");
        }

        toggleVisibility(streetviewContainer, true);
        streetView.setVisible(true);
        currentStopIndex = 0;
        await processTourLoop();
    } catch (error) {
        console.error('Error generating tour:', error);
        // The alert will now show the user-friendly error from the API
        alert(`Failed to generate tour. ${error.message}`);
        setLoading(false);
        resetToMainMenu();
    }
}

async function processTourLoop() {
    while (currentStopIndex < tourItinerary.length) {
        const currentStop = tourItinerary[currentStopIndex];

        if (currentStopIndex === 0) {
            setLoading(true, `Going to the first stop: ${currentStop.locationName}`);
            streetView.setPosition(currentStop.geometry.location);
        } else {
            const origin = tourItinerary[currentStopIndex - 1];
            await animateStreetView(origin, currentStop);
        }
        await processLocation(currentStop);
        currentStopIndex++;
    }

    setLoading(true, 'Tour Complete! Curating gallery...');
    await showFinalGallery(currentDestination);
}

async function animateStreetView(originStop, destinationStop) {
    const originName = originStop.locationName;
    const destinationName = destinationStop.locationName;
    setLoading(true, `Traveling from ${originName} to ${destinationName}...`);

    const originLocation = originStop.geometry.location;
    const destinationLocation = destinationStop.geometry.location;
    const distance = getDistanceInKm(originLocation, destinationLocation);
    const travelMode = await getTravelMode(originName, destinationName, distance);

    return new Promise((resolve) => {
        directionsService.route({
            origin: originLocation,
            destination: destinationLocation,
            travelMode: google.maps.TravelMode[travelMode]
        }, (response, status) => {
            if (status !== 'OK') {
                console.error(`Directions request failed: ${status}. Jumping directly.`);
                streetView.setPosition(destinationLocation);
                setTimeout(resolve, 1000);
                return;
            }
            const path = response.routes[0].overview_path;
            let step = 0;
            const animate = () => {
                if (step >= path.length) {
                    streetView.setPosition(destinationLocation);
                    resolve();
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

async function processLocation(location) {
    setLoading(false);
    synth.cancel();
    subtitlesContainer.textContent = `${location.locationName}: ${location.briefDescription}`;
    toggleVisibility(tourInfoContainer, true);

    return new Promise((resolve) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(`We have arrived at ${location.locationName}. ${location.briefDescription}`);
            utterance.rate = 0.9;
            utterance.pitch = 1.1;
            synth.speak(utterance);
            utterance.onend = () => setTimeout(() => {
                toggleVisibility(tourInfoContainer, false);
                resolve();
            }, 3000);
        } else {
            setTimeout(() => {
                toggleVisibility(tourInfoContainer, false);
                resolve();
            }, 5000);
        }
    });
}


// --- 7. ITINERARY AND GALLERY FETCHING ---

async function fetchItinerary(destination, focus) { // <-- MODIFIED
    // Define the text for each tour focus
    const focusText = {
        'general': 'a general tourist itinerary',
        'foodie': 'a foodie tour focusing on unique restaurants, markets, and culinary experiences',
        'history': 'a historical tour focusing on significant landmarks, museums, and sites',
        'nature': 'a nature tour focusing on parks, natural landscapes, and scenic views',
        'art': 'an art and culture tour visiting galleries, street art, theaters, and cultural centers',
        'hidden_gems': 'a tour of hidden gems and less-known, unique spots'
    }[focus];

    // Create a detailed prompt with error handling instructions
    const prompt = `Create a 5-stop, one-day ${focusText} for ${destination}.

**Instructions:**
1.  If the location "${destination}" is not a real, specific place (e.g., "asdfasdf", "nowhereville"), or if you cannot create a tour for it, you MUST respond with ONLY the following JSON object: \`{"error": "Could not generate a tour for '${destination}'. Please try a different place."}\`.
2.  Otherwise, generate a valid JSON array of 5 objects. Do not include markdown ticks like \`\`\`json or any text outside the JSON array itself.
3.  Each object in the array must have a "locationName" (a specific, mappable place like "Eiffel Tower, Paris, France") and a "briefDescription" (a short, engaging sentence related to the tour focus).`;

    let attempts = 0;
    while (true) {
        attempts++;
        // Update loading text to be more specific
        setLoading(true, `Generating ${focus} Itinerary... (Attempt ${attempts})`);
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.5, response_mime_type: "application/json" }
                }),
            });
            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            const data = await response.json();
            const parsedResponse = JSON.parse(data.candidates[0].content.parts[0].text);

            // --- NEW: Graceful Error Handling ---
            if (parsedResponse.error) {
                // If the API returns our specific error object, throw it to be caught by generateTour()
                throw new Error(parsedResponse.error);
            }

            const parsedItinerary = parsedResponse;

            setLoading(true, 'Validating locations...');
            const geocodedStops = await Promise.all(parsedItinerary.map(async (stop) => {
                try {
                    const { results } = await geocoder.geocode({ address: stop.locationName });
                    if (results && results.length > 0) {
                        stop.geometry = results[0].geometry;
                        return stop;
                    }
                } catch (e) { console.warn(`Geocoding failed for ${stop.locationName}`); }
                return null;
            }));

            const validStops = geocodedStops.filter(Boolean);
            if (validStops.length < 1) throw new Error("Could not find any valid, mappable locations for this tour.");
            return validStops;
        } catch (error) {
            console.error(`Attempt ${attempts} failed:`, error);
            if (attempts >= 5) throw new Error("Failed to get a valid itinerary after multiple attempts.");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
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

async function fetchWeather(query) {
    const prompt = `Provide the current weather for ${query}. Respond with a JSON object containing "temp_c", "temp_f", and "condition". Example: {"temp_c": 15, "temp_f": 59, "condition": "Partly Cloudy"}`;
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0, response_mime_type: "application/json" }
            }),
        });
        if (!response.ok) throw new Error('Weather API request failed');
        const data = await response.json();
        const weatherData = JSON.parse(data.candidates[0].content.parts[0].text);

        const condition = weatherData.condition.toLowerCase();
        let emoji = '❔';
        if (condition.includes('sun') || condition.includes('clear')) emoji = '☀️';
        else if (condition.includes('cloud')) emoji = '☁️';
        else if (condition.includes('rain') || condition.includes('shower')) emoji = '🌧️';
        else if (condition.includes('storm')) emoji = '⛈️';
        else if (condition.includes('snow')) emoji = '❄️';
        else if (condition.includes('fog') || condition.includes('mist')) emoji = '🌫️';

        return {
            text: `${weatherData.temp_f}°F / ${weatherData.temp_c}°C, ${weatherData.condition}`,
            emoji: emoji
        };
    } catch (error) {
        console.error("Could not fetch weather:", error);
        return null; // Fail gracefully
    }
}

async function fetchNewsOutlets(query) {
    const prompt = `List the top 3-4 local news outlets for ${query}. Provide only a valid JSON array of objects, where each object has "name" and "url". The URL must be a full, valid URL. Example: [{"name": "City Times", "url": "https://www.citytimes.com"}]`;
     try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, response_mime_type: "application/json" }
            }),
        });
        if (!response.ok) throw new Error('News API request failed');
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (error) {
        console.error("Could not fetch news:", error);
        return []; // Fail gracefully
    }
}

// --- 8. [NEW] GALLERY DISPLAY LOGIC ---

async function showFinalGallery(destination) {
    toggleVisibility(streetviewContainer, false);
    streetView.setVisible(false);
    setLoading(true, 'Curating gallery and local information...');

    // Start the clock as soon as the gallery view is requested
    updateLocalTime(localTime);

    try {
        // Fetch everything for the gallery view in parallel
        const [images, videos, weather, news] = await Promise.all([
            fetchImages(destination),
            fetchVideos(destination),
            fetchWeather(destination),
            fetchNewsOutlets(destination)
        ]);

        // Populate Weather
        localWeather.textContent = weather ? `${weather.emoji} ${weather.text}` : 'Unavailable';

        // Populate News
        populateNews(news, localNews);

        // Populate Image/Video Grid
        const galleryItems = [...images, ...videos];
        galleryItems.sort(() => Math.random() - 0.5);
        populateGalleryGrid(galleryItems, destination);

        // Hide loading and show the fully populated gallery
        setLoading(false);
        toggleVisibility(galleryContainer, true);

    } catch (error) {
        console.error("Failed to create gallery:", error);
        setLoading(false);
        alert(`Sorry, we couldn't create a gallery for ${destination}.`);
        resetToMainMenu();
    }
}

async function fetchImages(query) {
    console.log("Fetching images for:", query);
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
    console.log("Fetching videos for:", query);
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

function populateNews(newsItems, element) {
    element.innerHTML = ''; // Clear previous
    if (!newsItems || newsItems.length === 0) {
        element.innerHTML = '<p class="text-slate-400">No news outlets found.</p>';
        return;
    }
    newsItems.forEach(item => {
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.name;
        link.target = '_blank'; // Open in new tab
        link.rel = 'noopener noreferrer';
        link.className = 'block text-cyan-300 hover:text-cyan-200 truncate';
        element.appendChild(link);
    });
}

function populateGalleryGrid(items, destination) {
    galleryTitle.textContent = `Image & Video Gallery: ${destination}`;
    galleryGrid.innerHTML = '';

    if(items.length === 0) {
        galleryGrid.innerHTML = `<p class="text-slate-400 col-span-full text-center">No images or videos found.</p>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        // Added margin and a border for better visual separation
        div.className = 'aspect-video bg-slate-800 rounded-lg overflow-hidden shadow-lg border-2 border-slate-700 hover:border-cyan-400 transition-all';

        if (item.type === 'image') {
            // ... (image creation unchanged)
        } else if (item.type === 'video') {
            // ... (video creation unchanged)
        }
        galleryGrid.appendChild(div);
    });
}