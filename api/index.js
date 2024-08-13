const express = require('express');
const axios = require('axios');
const path = require('path');
const serverless = require('serverless-http');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const channelCache = new NodeCache({ stdTTL: 86400 }); // Cache TTL is set to 1 day (86400 seconds)

async function fetchChannelThumbnails(channelIds, apiKey) {
  const cachedThumbnails = {};
  const uncachedChannelIds = [];

  channelIds.forEach(channelId => {
    const cachedThumbnail = channelCache.get(channelId);
    if (cachedThumbnail) {
      cachedThumbnails[channelId] = cachedThumbnail;
    } else {
      uncachedChannelIds.push(channelId);
    }
  });

  if (uncachedChannelIds.length === 0) {
    return cachedThumbnails;
  }

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${uncachedChannelIds.join(',')}&key=${apiKey}`;
  try {
    const response = await axios.get(url);
    response.data.items.forEach(channel => {
      const thumbnailUrl = channel.snippet.thumbnails.default.url;
      cachedThumbnails[channel.id] = thumbnailUrl;
      channelCache.set(channel.id, thumbnailUrl);
    });

    return cachedThumbnails;
  } catch (error) {
    console.error('Error fetching channel thumbnails:', error.message);
    return cachedThumbnails;
  }
}

function extractHandle(youtubeLink) {
  if (!youtubeLink) return null;
  const atIndex = youtubeLink.indexOf('@');
  return atIndex !== -1 ? youtubeLink.substring(atIndex + 1).trim() : null;
}

function getRandomEntries(entries, excludeHandle) {
  const filteredEntries = entries.filter(entry => entry.handle !== excludeHandle);
  const shuffled = filteredEntries.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 4);
}

app.get('/entry/:handle', async (req, res) => {
  const handle = req.params.handle;

  try {
    const airtableUrl = `https://api.airtable.com/v0/${process.env.BASE_ID}/${process.env.TABLE_NAME}`;
    const airtableResponse = await axios.get(airtableUrl, {
      headers: { Authorization: `Bearer ${process.env.PERSONAL_ACCESS_TOKEN}` }
    });

    const allEntries = airtableResponse.data.records.map(record => ({
      name: record.fields['name'],
      handle: extractHandle(record.fields['youtubelink']),
      channelId: record.fields['channelId']
    }));

    const entry = allEntries.find(entry => entry.handle === handle);
    if (!entry) return res.status(404).send('Entry not found');

    const randomEntries = getRandomEntries(allEntries, handle);
    const channelIds = randomEntries.map(entry => entry.channelId);
    const apiKey = process.env.YOUTUBE_API_KEY;
    const thumbnails = await fetchChannelThumbnails(channelIds, apiKey);

    randomEntries.forEach(entry => {
      entry.thumbnail = thumbnails[entry.channelId] || '/images/img-placeholder.png';
    });

    res.render('entry', { entry, apiKey: process.env.YOUTUBE_API_KEY, randomEntries });
  } catch (error) {
    console.error(`Error fetching entry data:`, error.message);
    res.status(500).send('Error fetching entry data from Airtable');
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Export the app wrapped with serverless-http for Vercel
module.exports = app;
module.exports.handler = serverless
