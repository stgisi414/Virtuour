
const express = require('express');
const cors = require('cors');
const path = require('path');
const textToSpeech = require('@google-cloud/text-to-speech');

// Dynamic import for node-fetch (ES module)
let fetch;
(async () => {
  const fetchModule = await import('node-fetch');
  fetch = fetchModule.default;
})();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Configuration
const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY; // Service account key JSON as string
const GOOGLE_GEMINI_KEY = process.env.GOOGLE_GEMINI_KEY || 'AIzaSyDtLyUB-2wocE-uNG5e3pwNFArjn1GVTco';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyCYxnWpHNlzAz5h2W3pGTaW_oIP1ukTs1Y';
const CUSTOM_SEARCH_ENGINE_ID = process.env.CUSTOM_SEARCH_ENGINE_ID || '16b67ee3373714c2b';

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_GEMINI_KEY}`;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const CUSTOM_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

// Initialize Google Cloud TTS client
let ttsClient;
if (GOOGLE_TTS_KEY) {
  try {
    // Check if GOOGLE_TTS_KEY is a JSON string (service account) or API key
    if (GOOGLE_TTS_KEY.startsWith('{')) {
      // It's a service account JSON
      const credentials = JSON.parse(GOOGLE_TTS_KEY);
      ttsClient = new textToSpeech.TextToSpeechClient({
        credentials: credentials
      });
    } else {
      // It's an API key - use it with auth
      ttsClient = new textToSpeech.TextToSpeechClient({
        apiKey: GOOGLE_TTS_KEY
      });
    }
  } catch (error) {
    console.error('Error initializing Google TTS client:', error);
    ttsClient = new textToSpeech.TextToSpeechClient(); // Fallback to default
  }
} else {
  ttsClient = new textToSpeech.TextToSpeechClient(); // Use default credentials
}

// API Routes

// Generate tour itinerary
app.post('/api/generate-tour', async (req, res) => {
  try {
    if (!fetch) {
      return res.status(503).json({ error: 'Server still initializing, please try again' });
    }

    const { destination, focus } = req.body;
    
    if (!destination || !focus) {
      return res.status(400).json({ error: 'Destination and focus are required' });
    }

    console.log('Generating tour for:', destination, 'with focus:', focus);
    console.log('Using Gemini API key:', GOOGLE_GEMINI_KEY ? 'Present' : 'Missing');

    const prompt = `
      Create a 5-stop virtual tour itinerary for "${destination}" with focus on "${focus}".
      
      For each stop, provide:
      1. "locationName": Specific landmark/attraction name
      2. "briefDescription": One engaging sentence about this location
      3. "language": The primary language code (e.g., "en", "es", "fr") for pronunciation
      4. "languageRegion": The region code (e.g., "US", "GB", "MX") for accent
      
      Ensure locations are well-known, publicly accessible places with Street View coverage.
      
      Respond with ONLY a valid JSON array.
      
      Example:
      [
        {
          "locationName": "Statue of Liberty",
          "briefDescription": "This iconic symbol of freedom has welcomed visitors to New York Harbor since 1886.",
          "language": "en",
          "languageRegion": "US"
        }
      ]
    `;

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Referer': 'https://aitours.top'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          response_mime_type: "application/json"
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', response.status, errorText);
      throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const itinerary = JSON.parse(data.candidates[0].content.parts[0].text);

    if (!Array.isArray(itinerary) || itinerary.length === 0) {
      throw new Error("Invalid itinerary format");
    }

    res.json(itinerary);

  } catch (error) {
    console.error('Error generating tour:', error);
    res.status(500).json({ error: `Failed to generate tour: ${error.message}` });
  }
});

// Generate speech using Google Cloud TTS
app.post('/api/generate-speech', async (req, res) => {
  try {
    const { text, language = 'en', languageRegion = 'US' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!ttsClient) {
      return res.status(500).json({ error: 'TTS client not properly initialized' });
    }

    const languageCode = `${language}-${languageRegion}`;
    
    const request = {
      input: { text },
      voice: { 
        languageCode,
        ssmlGender: 'NEUTRAL'
      },
      audioConfig: { 
        audioEncoding: 'MP3',
        speakingRate: 0.9,
        pitch: 1.0
      },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.audioContent.length,
      'Cache-Control': 'public, max-age=3600'
    });
    
    res.send(response.audioContent);

  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).json({ error: `Failed to generate speech: ${error.message}` });
  }
});

// Fetch images
app.get('/api/images/:query', async (req, res) => {
  try {
    if (!fetch) {
      return res.status(503).json({ error: 'Server still initializing, please try again' });
    }

    const { query } = req.params;
    const url = `${CUSTOM_SEARCH_API_URL}?key=${GOOGLE_API_KEY}&cx=${CUSTOM_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&searchType=image&num=8`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Image search failed');
    
    const data = await response.json();
    const images = data.items ? data.items.map(item => ({ type: 'image', url: item.link })) : [];
    
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Fetch videos
app.get('/api/videos/:query', async (req, res) => {
  try {
    if (!fetch) {
      return res.status(503).json({ error: 'Server still initializing, please try again' });
    }

    const { query } = req.params;
    const url = `${YOUTUBE_API_URL}?key=${GOOGLE_API_KEY}&part=snippet&q=${encodeURIComponent(query + " tour")}&type=video&maxResults=4&videoEmbeddable=true`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('YouTube search failed');
    
    const data = await response.json();
    const videos = data.items ? data.items.map(item => ({ type: 'video', videoId: item.id.videoId })) : [];
    
    res.json(videos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Fetch local info
app.get('/api/local-info/:query', async (req, res) => {
  try {
    if (!fetch) {
      return res.status(503).json({ error: 'Server still initializing, please try again' });
    }

    const { query } = req.params;
    const prompt = `Provide local information for ${query}. Respond with JSON containing "weather" (object with "temp_c", "temp_f", "condition") and "timezone" (IANA timezone).`;
    
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Referer': 'https://aitours.top'
      },
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
    
    res.json({
      weather: { text: weatherText, emoji: weatherEmoji },
      timezone: info.timezone || null
    });
    
  } catch (error) {
    console.error('Error fetching local info:', error);
    res.status(500).json({ error: 'Failed to fetch local info' });
  }
});

// Fetch news outlets
app.get('/api/news/:query', async (req, res) => {
  try {
    if (!fetch) {
      return res.status(503).json({ error: 'Server still initializing, please try again' });
    }

    const { query } = req.params;
    const prompt = `List 3-4 major local news outlets for ${query}. Respond with JSON array of objects with "name" and "url" properties.`;
    
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Referer': 'https://aitours.top'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, response_mime_type: "application/json" }
      }),
    });
    
    if (!response.ok) throw new Error('News request failed');
    
    const data = await response.json();
    const news = JSON.parse(data.candidates[0].content.parts[0].text);
    
    res.json(news);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
