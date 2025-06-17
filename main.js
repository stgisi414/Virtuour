// --- 1. API KEY AND ENDPOINT CONFIGURATION ---
const GEMINI_API_KEY = 'AIzaSyDtLyUB-2wocE-uNG5e3pwNFArjn1GVTco';
const GOOGLE_API_KEY = 'AIzaSyCYxnWpHNlzAz5h2W3pGTaW_oIP1ukTs1Y'; // This is the same key used in index.html

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp-01-21:generateContent?key=${GEMINI_API_KEY}`;

// --- 2. DOM ELEMENT REFERENCES ---
const destinationInput = document.getElementById('destinationInput');
const generateTourButton = document.getElementById('generateTourButton');
const tourSetupContainer = document.getElementById('tour-setup');
const streetviewContainer = document.getElementById('streetview-container');
const tourInfoContainer = document.getElementById('tour-information');
const subtitlesContainer = document.getElementById('subtitles-container');
const loadingIndicator = document.getElementById('loading-indicator');
const loadingText = document.getElementById('loading-text');

// --- 3. GLOBAL VARIABLES ---
let streetView;
let directionsService;
let geocoder;
let tourItinerary = [];
let currentStopIndex = 0;
let synth = window.speechSynthesis;

// --- 4. INITIALIZATION ---
// This function is called by the global initMap function in index.html
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

// --- 5. HELPER FUNCTIONS ---

/**
 * Shows or hides UI elements with a smooth fade transition.
 * @param {HTMLElement} element - The DOM element to show or hide.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleVisibility(element, show) {
    if (show) {
        element.classList.remove('invisible', 'opacity-0');
    } else {
        element.classList.add('invisible', 'opacity-0');
    }
}

/**
 * Shows or hides the loading indicator and updates its message.
 * @param {boolean} isLoading - True to show the loading screen, false to hide it.
 * @param {string} message - The text to display on the loading screen.
 */
function setLoading(isLoading, message = '') {
    loadingText.textContent = message;
    toggleVisibility(loadingIndicator, isLoading);
}

// --- 6. CORE TOUR LOGIC ---

async function generateTour() {
    const destination = destinationInput.value.trim();
    if (!destination) {
        alert('Please enter a destination city.');
        return;
    }

    toggleVisibility(tourSetupContainer, false);

    try {
        tourItinerary = await fetchItinerary(destination);
        if (!tourItinerary || tourItinerary.length === 0) {
            throw new Error("The generated itinerary is empty.");
        }
        streetView.setVisible(true);
        currentStopIndex = 0;
        await processTourLoop();
    } catch (error) {
        console.error('Error generating tour:', error);
        alert(`Failed to generate tour. ${error.message}`);
        setLoading(false);
        toggleVisibility(tourSetupContainer, true);
        streetView.setVisible(false);
    }
}

async function fetchItinerary(destination) {
    const prompt = `Create a 5-stop, one-day tourist itinerary for ${destination}. The output MUST be a valid JSON array of objects. Do not include markdown ticks like \`\`\`json or any text outside the JSON array itself. Each object must have a "locationName" (specific mappable place) and a "briefDescription" (a short, engaging sentence). Example for "Paris": [{"locationName": "Eiffel Tower, Paris, France", "briefDescription": "Iconic symbol of Paris."}]`;

    let attempts = 0;
    while (true) {
        attempts++;
        console.log(`Attempt ${attempts} to fetch and parse itinerary...`);
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
            const itineraryText = data.candidates[0].content.parts[0].text;
            console.log("--- Raw Gemini Response Text ---");
            console.log(itineraryText);
            const parsedItinerary = JSON.parse(itineraryText);
            console.log("Successfully parsed itinerary:", parsedItinerary);
            return parsedItinerary;
        } catch (error) {
            console.error(`Attempt ${attempts} failed:`, error);
            if (attempts > 5) {
                 throw new Error("Failed to get valid itinerary after multiple attempts.");
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function processTourLoop() {
    while (currentStopIndex < tourItinerary.length) {
        const currentStop = tourItinerary[currentStopIndex];
        const destination = currentStop.locationName;

        if (currentStopIndex === 0) {
            setLoading(true, `Going to the first stop: ${destination}`);
            try {
                const { results } = await geocoder.geocode({ address: destination });
                if (results && results.length > 0) {
                    streetView.setPosition(results[0].geometry.location);
                } else {
                    streetView.setPosition({ query: destination });
                }
            } catch {
                streetView.setPosition({ query: destination });
            }
        } else {
            const origin = tourItinerary[currentStopIndex - 1].locationName;
            setLoading(true, `Traveling from ${origin} to ${destination}...`);
            await animateStreetView(origin, destination);
        }
        await processLocation(currentStop);
        currentStopIndex++;
    }

    // --- TOUR COMPLETE LOGIC ---
    setLoading(true, 'Tour Complete!');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Show message for 3s

    // Reset UI to initial state without reloading the page
    setLoading(false);
    streetView.setVisible(false);
    toggleVisibility(tourInfoContainer, false);
    destinationInput.value = '';
    generateTourButton.disabled = false;
    generateTourButton.textContent = 'Generate Another Tour';
    toggleVisibility(tourSetupContainer, true);
}

async function animateStreetView(origin, destination) {
    return new Promise((resolve) => {
        directionsService.route({ origin, destination, travelMode: 'DRIVING' }, (response, status) => {
            if (status !== 'OK') {
                console.error('Directions request failed:', status);
                alert(`Could not calculate route. Jumping directly.`);
                streetView.setPosition({ query: destination });
                resolve();
                return;
            }
            const path = response.routes[0].overview_path;
            let step = 0;
            const animate = () => {
                if (step >= path.length) {
                    resolve();
                    return;
                }
                streetView.setPosition(path[step]);
                // Smoother animation with a shorter timeout
                setTimeout(animate, 40);
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

    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(`We have arrived at ${location.locationName}. ${location.briefDescription}`);
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        synth.speak(utterance);
        return new Promise((resolve) => {
            utterance.onend = () => {
                setTimeout(() => {
                    toggleVisibility(tourInfoContainer, false);
                    resolve();
                }, 3000); // Linger on subtitles for 3s after speech ends
            };
        });
    } else {
        return new Promise((resolve) => setTimeout(() => {
             toggleVisibility(tourInfoContainer, false);
             resolve();
        }, 5000));
    }
}