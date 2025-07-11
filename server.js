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
const GOOGLE_GEMINI_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const CUSTOM_SEARCH_ENGINE_ID = process.env.CUSTOM_SEARCH_ENGINE_ID;

// Validate that required environment variables are set
if (!GOOGLE_GEMINI_KEY) {
    console.error('GEMINI_API_KEY not found in environment variables');
}
if (!GOOGLE_API_KEY) {
    console.error('GOOGLE_API_KEY not found in environment variables');
}
if (!CUSTOM_SEARCH_ENGINE_ID) {
    console.error('CUSTOM_SEARCH_ENGINE_ID not found in environment variables');
}

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

// Area AI chat endpoint
app.post('/api/area-ai-chat', async (req, res) => {
    try {
        const { message, areaName, context } = req.body;

        if (!message || !areaName) {
            return res.status(400).json({ error: 'Message and area name are required' });
        }

        // Create a comprehensive prompt for the AI
        const prompt = `You are a knowledgeable local area guide AI assistant. You're helping someone who is virtually exploring ${areaName} through street view.

Context: ${context}

The user is asking: "${message}"

Please provide a helpful, informative response about ${areaName}. Include specific details about:
- Local attractions and landmarks
- Historical information
- Cultural insights
- Food and dining recommendations
- Transportation tips
- Hidden gems and local secrets
- Current events or seasonal information when relevant

Keep your response conversational, engaging, and under 200 words. If you don't have specific information about ${areaName}, provide general guidance about the type of area it is and suggest what kinds of things the user might look for.`;

        // Use OpenAI API (you'll need to set up your OpenAI API key)
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful local area guide assistant. Provide informative, engaging responses about local areas, attractions, culture, and travel tips.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error('OpenAI API request failed');
        }

        const data = await response.json();
        const aiResponse = data.choices[0]?.message?.content || 'Sorry, I could not generate a response at this time.';

        res.json({ response: aiResponse });

    } catch (error) {
        console.error('Error in area AI chat:', error);

        // Fallback response if AI fails
        const fallbackResponse = `I'd be happy to help you learn more about ${req.body.areaName || 'this area'}! While I'm having trouble accessing my knowledge base right now, I recommend exploring the local attractions, trying regional cuisine, and checking out any historical sites or cultural landmarks. What specific aspect of the area interests you most?`;

        res.json({ response: fallbackResponse });
    }
});

// Generate speech endpoint
app.post('/api/generate-speech', async (req, res) => {
  try {
    if (!fetch) {
      return res.status(503).json({ error: 'Server still initializing, please try again' });
    }

    const { text, language = 'en', languageRegion = 'US' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const languageCode = `${language}-${languageRegion}`;

    const requestBody = {
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

    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://aitours.top'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS API Error:', response.status, errorText);
      throw new Error(`TTS API Error: ${response.status}`);
    }

    const data = await response.json();
    const audioContent = Buffer.from(data.audioContent, 'base64');

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioContent.length,
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(audioContent);

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

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://aitours.top'
      }
    });
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

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://aitours.top'
      }
    });
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

// Serve Firebase config
app.get('/firebase-config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  });
});

// Serve static files from current directory
app.use(express.static('.'));

// Serve index.html with environment variables
app.get('/', (req, res) => {
    const fs = require('fs');
    const path = require('path');

    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    html = html.replace('{{GOOGLE_API_KEY}}', process.env.GOOGLE_API_KEY || '');

    res.send(html);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});