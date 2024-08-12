// api/index.js
const serverless = require('serverless-http');
const express = require('express');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

module.exports.handler = serverless(app);

// Access environment variables
const PERSONAL_ACCESS_TOKEN = process.env.PERSONAL_ACCESS_TOKEN;
const BASE_ID = process.env.BASE_ID;
const TABLE_NAME = process.env.TABLE_NAME;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Function to extract handle from YouTube URL
function extractHandle(youtubeLink) {
    if (!youtubeLink) return null;
    const atIndex = youtubeLink.indexOf('@');
    return atIndex !== -1 ? youtubeLink.substring(atIndex + 1).trim() : null;
}

// Function to get random entries
function getRandomEntries(entries, excludeHandle) {
    const filteredEntries = entries.filter(entry => entry.handle !== excludeHandle);
    const shuffled = filteredEntries.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4); // Get 4 random entries
}

// Route to render the index page
app.get('/', async (req, res) => {
    try {
        const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;
        const airtableResponse = await axios.get(airtableUrl, {
            headers: { Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}` }
        });

        const entries = airtableResponse.data.records.map(record => ({
            name: record.fields['name'],
            youtubeLink: record.fields['youtubelink'],
            handle: extractHandle(record.fields['youtubelink']),
        }));

        console.log('Entries for index:', entries); // Debug log to ensure entries are fetched

        // Render the index.ejs template with the entries
        res.render('index', { entries });
    } catch (error) {
        console.error('Error fetching data for index:', error.message);
        res.status(500).send('Error fetching data for index page');
    }
});

// Route to render individual entry pages using only the handle
app.get('/:handle', async (req, res) => {
    const handle = req.params.handle;

    try {
        const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;
        const airtableResponse = await axios.get(airtableUrl, {
            headers: { Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}` }
        });

        const allEntries = airtableResponse.data.records.map(record => ({
            name: record.fields['name'],
            description: record.fields['description'],
            youtubeLink: record.fields['youtubelink'],
            handle: extractHandle(record.fields['youtubelink']),
            image: record.fields['image'] || 'default-image-url.jpg' // Ensure image is defined
        }));

        const entry = allEntries.find(entry => entry.handle === handle);
        if (!entry) return res.status(404).send('Entry not found');

        const channelId = await getChannelId(handle);
        const randomEntries = getRandomEntries(allEntries, handle); // Generate random entries

        // Render the entry template with the entry, API key, and random entries
        res.render('entry', { entry: { ...entry, channelId }, apiKey: YOUTUBE_API_KEY, randomEntries });
    } catch (error) {
        console.error(`Error fetching entry data:`, error.message);
        res.status(500).send('Error fetching entry data from Airtable');
    }
});

// Function to get channel ID from YouTube handle
async function getChannelId(handle) {
    if (!handle) return null;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${handle}&key=${YOUTUBE_API_KEY}`;
    try {
        const response = await axios.get(url);
        if (response.data.items && response.data.items.length > 0) {
            return response.data.items[0].snippet.channelId;
        }
    } catch (error) {
        console.error(`Error fetching channel ID:`, error.message);
    }
    return null;
}

module.exports = app;
module.exports.handler = serverless(app);
