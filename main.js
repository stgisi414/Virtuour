// --- 1. API KEY AND ENDPOINT CONFIGURATION ---
const GEMINI_API_KEY = 'AIzaSyDtLyUB-2wocE-uNG5e3pwNFArjn1GVTco'; // Your Gemini API Key
const GOOGLE_API_KEY = 'AIzaSyCYxnWpHNlzAz5h2W3pGTaW_oIP1ukTs1Y'; // Your Google Cloud API Key

// --- [ADD THIS] - New API configuration for the Gallery ---
const YOUTUBE_API_KEY = GOOGLE_API_KEY; // Assumes same key, change if different
const CUSTOM_SEARCH_ENGINE_ID = '16b67ee3373714c2b'; // <--- PASTE YOUR CX ID HERE

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const CUSTOM_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';


// --- 2. DOM ELEMENT REFERENCES ---
const destinationInput = document.getElementById('destinationInput');
const generateTourButton = document.getElementById('generateTourButton');
const tourSetupContainer = document.getElementById('tour-setup');
const streetviewContainer = document.getElementById('streetview-container');
const tourInfoContainer = document.getElementById('tour-information');
const subtitlesContainer = document.getElementById('subtitles-container');
const loadingIndicator = document.getElementById('loading-indicator');
const loadingText = document.getElementById('loading-text');

// --- [ADD THIS] - New Gallery DOM References ---
const galleryContainer = document.getElementById('gallery-container');
const galleryTitle = document.getElementById('gallery-title');
const galleryGrid = document.getElementById('gallery-grid');
const endTourButton = document.getElementById('endTourButton');


// --- 3. GLOBAL VARIABLES ---
let streetView;
let directionsService;
let geocoder;
let tourItinerary = [];
let currentStopIndex = 0;
let synth = window.speechSynthesis;
let currentDestination = '';


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
// --- [ADD THIS] Event listener for the new gallery close button
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

// --- [ADD THIS] New function to reset the entire UI to the start screen ---
function resetToMainMenu() {
    toggleVisibility(galleryContainer, false);
    toggleVisibility(streetviewContainer, false); // Ensure canvas is hidden
    streetView.setVisible(false);
    toggleVisibility(tourInfoContainer, false);

    destinationInput.value = '';
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Another Tour';
    toggleVisibility(tourSetupContainer, true);
    galleryGrid.innerHTML = ''; // Clear gallery content
}


// --- 6. CORE TOUR LOGIC ---

async function generateTour() {
    currentDestination = destinationInput.value.trim();
    if (!currentDestination) {
        alert('Please enter a destination city.');
        return;
    }

    toggleVisibility(tourSetupContainer, false);

    try {
        tourItinerary = await fetchItinerary(currentDestination);
        if (!tourItinerary || tourItinerary.length === 0) {
            throw new Error("The generated itinerary is empty.");
        }
        // --- [MODIFIED] Show canvas right before tour starts ---
        toggleVisibility(streetviewContainer, true);
        streetView.setVisible(true);
        currentStopIndex = 0;
        await processTourLoop();
    } catch (error) {
        console.error('Error generating tour:', error);
        alert(`Failed to generate tour. ${error.message}`);
        setLoading(false);
        resetToMainMenu(); // Use the new reset function on failure
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

    // --- [MODIFIED] Tour Complete Logic ---
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

async function fetchItinerary(destination) {
    // This function remains largely the same as before
    const prompt = `Create a 5-stop, one-day tourist itinerary for ${destination}. The output MUST be a valid JSON array of objects. Do not include markdown ticks like \`\`\`json or any text outside the JSON array itself. Each object must have a "locationName" (a specific, mappable place like "Eiffel Tower, Paris, France") and a "briefDescription" (a short, engaging sentence).`;
    let attempts = 0;
    while (true) {
        attempts++;
        setLoading(true, `Generating Itinerary... (Attempt ${attempts})`);
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
            let parsedItinerary = JSON.parse(data.candidates[0].content.parts[0].text);

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
            if (validStops.length < 1) throw new Error("Could not find any valid locations.");
            return validStops;
        } catch (error) {
            console.error(`Attempt ${attempts} failed:`, error);
            if (attempts >= 5) throw new Error("Failed to get a valid itinerary after multiple attempts.");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function getTravelMode(originName, destinationName, distanceKm) {
    // This function remains the same
    const prompt = `You are a travel planner. Choose the best travel mode. Origin: "<span class="math-inline">\{originName\}"\. Destination\: "</span>{destinationName}". Distance: ${distanceKm.toFixed(2)} km. If the distance is very short (under 2 km) and in a city, prefer 'WALKING'. Otherwise, 'DRIVING'. Respond with only the single word: 'DRIVING' or 'WALKING'.`;
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


// --- 8. [NEW] GALLERY DISPLAY LOGIC ---

async function showFinalGallery(destination) {
    // Hide tour elements
    toggleVisibility(streetviewContainer, false);
    streetView.setVisible(false);

    try {
        // Fetch images and videos in parallel
        const [images, videos] = await Promise.all([
            fetchImages(destination),
            fetchVideos(destination)
        ]);

        const galleryItems = [...images, ...videos];
        // Shuffle for a nice mixed grid
        galleryItems.sort(() => Math.random() - 0.5);

        populateGalleryGrid(galleryItems, destination);
        setLoading(false);
        toggleVisibility(galleryContainer, true);

    } catch (error) {
        console.error("Failed to create gallery:", error);
        // If gallery fails, just go back to the main menu
        setLoading(false);
        alert(`Sorry, we couldn't create a gallery for ${destination}.`);
        resetToMainMenu();
    }
}

async function fetchImages(query) {
    console.log("Fetching images for:", query);
    const url = `<span class="math-inline">\{CUSTOM\_SEARCH\_API\_URL\}?key\=</span>{GOOGLE_API_KEY}&cx=<span class="math-inline">\{CUSTOM\_SEARCH\_ENGINE\_ID\}&q\=</span>{encodeURIComponent(query)}&searchType=image&num=10`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Image search failed: ${response.status}`);
        const data = await response.json();
        if (!data.items) return [];
        return data.items.map(item => ({ type: 'image', url: item.link }));
    } catch (error) {
        console.error("Could not fetch images:", error);
        return []; // Return empty array on failure
    }
}

async function fetchVideos(query) {
    console.log("Fetching videos for:", query);
    const url = `<span class="math-inline">\{YOUTUBE\_API\_URL\}?key\=</span>{YOUTUBE_API_KEY}&part=snippet&q=${encodeURIComponent(query + " tour")}&type=video&maxResults=5&videoEmbeddable=true`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Youtube failed: ${response.status}`);
        const data = await response.json();
        if (!data.items) return [];
        return data.items.map(item => ({ type: 'video', videoId: item.id.videoId }));
    } catch (error) {
        console.error("Could not fetch videos:", error);
        return []; // Return empty array on failure
    }
}

function populateGalleryGrid(items, destination) {
    galleryTitle.textContent = `Image & Video Gallery: ${destination}`;
    galleryGrid.innerHTML = ''; // Clear previous items

    if(items.length === 0) {
        galleryGrid.innerHTML = `<p class="text-slate-400 col-span-full text-center">No images or videos found for ${destination}.</p>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'aspect-video bg-slate-800 rounded-lg overflow-hidden shadow-lg';

        if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = item.url;
            img.className = 'w-full h-full object-cover';
            img.alt = `Image of ${destination}`;
            img.onerror = () => { div.style.display = 'none'; }; // Hide if image fails to load
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