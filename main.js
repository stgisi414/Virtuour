// --- 1. API KEY AND ENDPOINT CONFIGURATION ---
// IMPORTANT: Replace placeholders with your actual API keys.
const GEMINI_API_KEY = 'AIzaSyDIFeql6HUpkZ8JJlr_kuN0WDFHUyOhijA';
const GOOGLE_API_KEY = 'AIzaSyAJ6YHA6SlQgqEYvJsR7t5ilMOkWiYnO'; // This is the same key used in index.html
const CUSTOM_SEARCH_ENGINE_ID = '16b67ee3373714c2b';

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp-01-21:generateContent?key=${GEMINI_API_KEY}`;

// --- 2. DOM ELEMENT REFERENCES ---
const destinationInput = document.getElementById('destinationInput');
const generateTourButton = document.getElementById('generateTourButton');
const tourSetupContainer = document.getElementById('tour-setup');
const streetviewContainer = document.getElementById('streetview-container');
const tourInfoContainer = document.getElementById('tour-information');
const slideshowContainer = document.getElementById('slideshow-container');
const subtitlesContainer = document.getElementById('subtitles-container');
const loadingIndicator = document.getElementById('loading-indicator');
const loadingText = document.getElementById('loading-text');

// --- ADD THIS FUNCTION ---
/**
 * Shows or hides the loading indicator and updates its message.
 * @param {boolean} isLoading - True to show the loading screen, false to hide it.
 * @param {string} message - The text to display on the loading screen.
 */
function setLoading(isLoading, message = '') {
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');

    if (isLoading) {
        loadingText.textContent = message;
        loadingIndicator.classList.remove('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

// --- 3. GLOBAL VARIABLES ---
let streetView;
let directionsService;
let tourItinerary = [];
let currentStopIndex = 0;
let synth = window.speechSynthesis;

// --- 4. INITIALIZATION ---
// This function is called by the Google Maps script tag once it's loaded.
window.addEventListener('map-ready', () => {
    try {
        streetView = new google.maps.StreetViewPanorama(streetviewContainer, {
            position: { lat: 40.7291, lng: -73.9965 }, // Default start
            pov: { heading: 165, pitch: 0 },
            zoom: 1,
            visible: false,
            addressControl: false,
            linksControl: false,
            fullscreenControl: false,
            enableCloseButton: false,
        });
        directionsService = new google.maps.DirectionsService();
        console.log('Google Maps initialized successfully');
    } catch (error) {
        console.error('Error initializing Google Maps:', error);
    }
});

generateTourButton.addEventListener('click', generateTour);

// --- 5. CORE FUNCTIONS ---

/**
 * Main function to start the tour generation process.
 */
async function generateTour() {
    const destination = destinationInput.value.trim();
    if (!destination) {
        alert('Please enter a destination city.');
        return;
    }

    setLoading(true, 'Generating Itinerary with Gemini...');
    tourSetupContainer.classList.add('hidden');

    try {
        tourItinerary = await fetchItinerary(destination);
        streetView.setVisible(true);
        currentStopIndex = 0;
        await startTourFrom(null); // Start from a neutral point
    } catch (error) {
        console.error('Error generating tour:', error);
        alert(`Failed to generate tour. ${error.message}`);
        setLoading(false);
        tourSetupContainer.classList.remove('hidden');
        streetView.setVisible(false);
    }
}

/**
 * Fetches a 5-stop itinerary from the Gemini API.
 * @param {string} destination - The city for the tour.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of location objects.
 */
async function fetchItinerary(destination) {
    const prompt = `Create a 5-stop, one-day tourist itinerary for ${destination}. The output must be a valid JSON array of objects, where each object has a "locationName" (e.g., "Eiffel Tower") and a "briefDescription" (a short, engaging sentence). Do not include any text outside the JSON array itself.`;

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.5,
                    response_mime_type: "application/json",
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API Error Response:', errorText);
            throw new Error(`Gemini API request failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response format from Gemini API');
        }
        
        const itineraryText = data.candidates[0].content.parts[0].text;
        return JSON.parse(itineraryText);
    } catch (error) {
        console.error('Error in fetchItinerary:', error);
        throw error;
    }
}

/**
 * Starts the tour, beginning the animation to the next stop.
 * @param {string|null} origin - The starting point name, or null for the very first leg.
 */
async function startTourFrom(origin) {
    if (currentStopIndex >= tourItinerary.length) {
        setLoading(true, 'Tour Complete!');
        setTimeout(() => window.location.reload(), 5000); // Reset after 5s
        return;
    }

    if (!streetView) {
        throw new Error('Google Maps Street View not initialized. Please check your API key.');
    }

    const destination = tourItinerary[currentStopIndex].locationName;
    setLoading(true, `Traveling to ${destination}...`);
    tourInfoContainer.classList.add('hidden');
    synth.cancel(); // Stop any currently playing speech

    const originPoint = origin ? origin : `${destinationInput.value} city center`;

    await animateStreetView(originPoint, destination);
    await processLocation(tourItinerary[currentStopIndex]);

    const previousStopName = tourItinerary[currentStopIndex].locationName;
    currentStopIndex++;
    startTourFrom(previousStopName); // "Drive" to the next location
}

/**
 * Simulates driving by animating the Street View panorama along a route.
 * @param {string} origin - The start location name.
 * @param {string} destination - The end location name.
 */
async function animateStreetView(origin, destination) {
    return new Promise((resolve) => {
        directionsService.route(
            { origin, destination, travelMode: 'DRIVING' },
            (response, status) => {
                if (status !== 'OK') {
                    console.error('Directions request failed:', status);
                    alert('Could not calculate route. Jumping directly.');
                    streetView.setPosition({ query: destination });
                    resolve();
                    return;
                }

                const route = response.routes[0];
                const path = route.overview_path;
                let step = 0;

                const animate = () => {
                    if (step >= path.length) {
                        resolve();
                        return;
                    }
                    streetView.setPosition(path[step]);
                    // Add a short delay between steps to make the animation smoother
                    setTimeout(animate, 100);
                    step++;
                };

                animate();
            }
        );
    });
}

/**
 * Processes a location by showing information and starting narration.
 * @param {Object} location - The location object with locationName and briefDescription.
 */
async function processLocation(location) {
    setLoading(false);
    tourInfoContainer.classList.remove('hidden');
    
    // Display location information
    subtitlesContainer.textContent = `${location.locationName}: ${location.briefDescription}`;
    
    // Start text-to-speech narration
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(
            `Welcome to ${location.locationName}. ${location.briefDescription}`
        );
        utterance.rate = 0.8;
        utterance.pitch = 1;
        synth.speak(utterance);
        
        // Wait for speech to complete before continuing
        return new Promise((resolve) => {
            utterance.onend = () => {
                setTimeout(resolve, 2000); // Wait 2 seconds after speech ends
            };
        });
    } else {
        // If speech synthesis not available, just wait a bit
        return new Promise((resolve) => setTimeout(resolve, 4000));
    }
}