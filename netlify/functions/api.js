const https = require('https');

const BRAVE_KEY = process.env.BRAVE_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Topic → search queries mapping. Each topic gets 2-3 focused queries
// so Brave returns a spread of useful results rather than one narrow slice.
const TOPIC_QUERIES = {
  alcohol: [
    'evidence-based strategies to stop drinking alcohol',
    'alcohol recovery coping skills urge management'
  ],
  smoking: [
    'quit smoking nicotine craving strategies that work',
    'nicotine withdrawal timeline what to expect'
  ],
  porn: [
    'overcoming compulsive pornography use strategies',
    'compulsive sexual behavior recovery resources'
  ],
  phone: [
    'how to break phone addiction screen time strategies',
    'digital minimalism reduce doomscrolling'
  ],
  gambling: [
    'problem gambling recovery resources self-help',
    'how to stop gambling urges coping strategies'
  ],
  food: [
    'emotional eating vs physical hunger strategies',
    'binge eating recovery evidence-based approaches'
  ],
  general: [
    'habit change urge surfing evidence-based techniques',
    'breaking bad habits cue craving response reward loop'
  ]
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const action = event.queryStringParameters && event.queryStringParameters.action;

  if (action === 'knowledge') {
    return handleKnowledge(event);
  }
  if (action === 'quotes') {
    return handleQuotes(event);
  }
  if (action === 'reflections') {
    return handleReflections(event);
  }

  return {
    statusCode: 400,
    headers: CORS,
    body: JSON.stringify({ error: 'Unknown action' })
  };
};

async function handleKnowledge(event) {
  const topic = (event.queryStringParameters.topic || 'general').toLowerCase();
  const queries = TOPIC_QUERIES[topic] || TOPIC_QUERIES.general;

  try {
    // Step 1: Run all Brave queries in parallel
    const searchPromises = queries.map(q => braveSearch(q));
    const searchResults = await Promise.allSettled(searchPromises);

    // Collect all results, dedupe by domain
    const allResults = [];
    const seenDomains = new Set();

    for (const result of searchResults) {
      if (result.status !== 'fulfilled') continue;
      const web = result.value && result.value.web && result.value.web.results;
      if (!web) continue;
      for (const r of web) {
        // Extract domain for deduplication
        let domain = '';
        try { domain = new URL(r.url).hostname.replace('www.', ''); } catch(e) {}
        if (seenDomains.has(domain)) continue;
        seenDomains.add(domain);
        allResults.push({
          title: r.title || '',
          description: r.description || '',
          url: r.url || ''
        });
      }
    }

    if (allResults.length === 0) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ articles: [], source: 'none' })
      };
    }

    // Step 2: Use Claude to curate and filter the results
    if (ANTHROPIC_KEY) {
      try {
        const curated = await curateWithClaude(allResults.slice(0, 15), topic);
        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({ articles: curated, source: 'curated' })
        };
      } catch(e) {
        // If Claude fails, fall back to raw Brave results
        console.error('Claude curation failed, returning raw results:', e.message);
      }
    }

    // Fallback: return raw Brave results (top 8)
    const articles = allResults.slice(0, 8).map(r => ({
      tag: topic.charAt(0).toUpperCase() + topic.slice(1),
      title: r.title,
      body: r.description,
      url: r.url
    }));

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ articles, source: 'brave' })
    };

  } catch(e) {
    console.error('Knowledge handler error:', e);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Failed to fetch articles' })
    };
  }
}

async function curateWithClaude(results, topic) {
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are curating reading material for someone working on breaking a habit/addiction related to: ${topic}.

Here are search results to evaluate:
${JSON.stringify(results, null, 2)}

Select the 5-8 most useful, credible articles for someone actively trying to change this behavior. Prioritize:
- Evidence-based sources (medical orgs, research institutions, established recovery organizations)
- Practical, actionable content over theoretical
- Compassionate framing (no shame-based or sensationalized content)
- Skip anything that's primarily an ad, a product page, or clickbait

Respond ONLY with a JSON array, no other text. Each item must have:
- "tag": a short category label (e.g. "Coping skills", "Science", "Recovery", "Practical tips")
- "title": the article title, cleaned up if needed
- "body": a 1-2 sentence description of what the reader will get from this article, written in a warm and direct tone
- "url": the original URL`
    }]
  };

  const response = await callClaude(body);
  const text = response.content && response.content[0] && response.content[0].text;
  if (!text) throw new Error('Empty Claude response');

  // Parse JSON, stripping markdown fences if present
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const articles = JSON.parse(clean);

  if (!Array.isArray(articles)) throw new Error('Claude did not return an array');
  return articles;
}

// ---- QUOTES: web-sourced inspirational quotes ----

// Search queries designed to surface real, attributed quotes about overcoming
// specific habits, not generic "motivational quotes" listicles.
const QUOTE_QUERIES = {
  alcohol: [
    'inspirational quotes overcoming alcohol addiction recovery',
    'famous quotes sobriety strength authors philosophers'
  ],
  smoking: [
    'inspirational quotes quitting smoking willpower',
    'famous quotes breaking free from addiction'
  ],
  porn: [
    'quotes self-discipline overcoming compulsive behavior',
    'quotes freedom from compulsion philosophers'
  ],
  phone: [
    'quotes digital minimalism attention focus',
    'quotes mindfulness presence over distraction philosophers'
  ],
  gambling: [
    'quotes overcoming gambling addiction recovery strength',
    'quotes self-control temptation philosophers'
  ],
  food: [
    'quotes emotional eating mindful relationship with food',
    'quotes self-compassion healing philosophers'
  ],
  general: [
    'inspirational quotes overcoming addiction recovery',
    'philosophical quotes willpower self-discipline Stoic Rumi Frankl',
    'quotes perseverance struggle transformation'
  ]
};

async function handleQuotes(event) {
  // Accepts comma-separated habits, e.g. ?action=quotes&habits=alcohol,smoking
  const habitsParam = (event.queryStringParameters.habits || 'general');
  const habits = habitsParam.split(',').map(h => h.trim().toLowerCase());

  try {
    // Build a deduplicated list of search queries from all tracked habits.
    const queries = [];
    const seen = new Set();
    for (const h of habits) {
      const qs = QUOTE_QUERIES[h] || QUOTE_QUERIES.general;
      for (const q of qs) {
        if (!seen.has(q)) { seen.add(q); queries.push(q); }
      }
    }
    // Also always include general quotes for breadth.
    for (const q of QUOTE_QUERIES.general) {
      if (!seen.has(q)) { seen.add(q); queries.push(q); }
    }

    // Run searches in parallel (cap at 5 to stay fast).
    const searchPromises = queries.slice(0, 5).map(q => braveSearch(q));
    const searchResults = await Promise.allSettled(searchPromises);

    // Collect all result snippets.
    const allResults = [];
    for (const result of searchResults) {
      if (result.status !== 'fulfilled') continue;
      const web = result.value && result.value.web && result.value.web.results;
      if (!web) continue;
      for (const r of web) {
        allResults.push({
          title: r.title || '',
          description: r.description || '',
          url: r.url || ''
        });
      }
    }

    if (allResults.length === 0 || !ANTHROPIC_KEY) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ quotes: [], source: 'none' })
      };
    }

    // Have Claude extract and curate real quotes from the search results.
    const curated = await extractQuotesWithClaude(allResults.slice(0, 20), habits);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ quotes: curated, source: 'web' })
    };

  } catch(e) {
    console.error('Quotes handler error:', e);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Failed to fetch quotes' })
    };
  }
}

async function extractQuotesWithClaude(results, habits) {
  const habitList = habits.join(', ');
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are helping someone who is working on overcoming: ${habitList}.

Below are web search results about inspirational quotes related to addiction, recovery, willpower, and self-discipline. Extract the best actual quotes you can find in these results. Also add any well-known quotes from philosophers, authors, or recovery literature that are genuinely relevant to fighting these specific habits — you don't need to limit yourself to only what's in the search results if you know a quote is real and correctly attributed.

Search results:
${JSON.stringify(results, null, 2)}

Return 12-18 quotes. Prioritize:
- Real, correctly attributed quotes (not fabricated or misattributed)
- Quotes that speak to the specific struggle of overcoming urges, cravings, or compulsive behavior
- Voices from diverse traditions: Stoic philosophy, Sufi poetry, recovery literature, psychology, literature, spiritual traditions
- Quotes that are compassionate and empowering, not punishing or shame-based
- Mix of well-known and lesser-known quotes

Respond ONLY with a JSON array, no other text. Each item must have:
- "t": the quote text (just the words, no quotation marks)
- "a": attribution (author name)
- "src": "web" (to distinguish from other quote sources)`
    }]
  };

  const response = await callClaude(body);
  const text = response.content && response.content[0] && response.content[0].text;
  if (!text) throw new Error('Empty Claude response');

  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const quotes = JSON.parse(clean);
  if (!Array.isArray(quotes)) throw new Error('Claude did not return an array');
  return quotes;
}

// ---- REFLECTIONS: personalized lines generated from the user's own reasons ----

async function handleReflections(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: 'POST required' })
    };
  }

  if (!ANTHROPIC_KEY) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ reflections: [], source: 'none' })
    };
  }

  try {
    const payload = JSON.parse(event.body);
    const habits = payload.habits || [];    // [{name, reasons: [string]}]

    if (!habits.length) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ reflections: [], source: 'none' })
      };
    }

    const reflections = await generateReflections(habits);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ reflections, source: 'personal' })
    };

  } catch(e) {
    console.error('Reflections handler error:', e);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Failed to generate reflections' })
    };
  }
}

async function generateReflections(habits) {
  // Build a summary of what the user is working on and why.
  const context = habits.map(h => {
    const reasonList = (h.reasons || []).map((r, i) => `  ${i+1}. ${r}`).join('\n');
    return `Habit: ${h.name}\nTheir reasons for quitting:\n${reasonList || '  (no reasons written yet)'}`;
  }).join('\n\n');

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Someone is using an app to track their recovery from habits they want to break. They will read your words during a craving — in the hardest moment. Write short, warm reflections that speak directly to THEIR specific situation based on what they've shared below.

${context}

Write 8-10 reflections. Each should be 1-2 sentences. Rules:
- Ground each one in something specific they wrote in their reasons — echo their language, reference their people, mirror their values
- Write as a warm, steady voice — not a therapist, not a coach, not a greeting card. Like a trusted friend who knows what they're going through.
- Never shame. Never lecture. Never use the word "journey."
- Some should be gentle ("The version of you that wrote those reasons is the same version reading this right now"). Some should be firm ("You already know what this costs. That's why you're here instead of there."). Mix the register.
- These will be shown one at a time, randomly. Each must stand alone.

Respond ONLY with a JSON array, no other text. Each item must have:
- "t": the reflection text
- "src": "personal"`
    }]
  };

  const response = await callClaude(body);
  const text = response.content && response.content[0] && response.content[0].text;
  if (!text) throw new Error('Empty Claude response');

  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const reflections = JSON.parse(clean);
  if (!Array.isArray(reflections)) throw new Error('Claude did not return an array');
  return reflections;
}

// ---- API wrappers (matching ko.ah pattern exactly) ----

function braveSearch(query) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.search.brave.com',
      port: 443,
      path: '/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=5',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'identity',
        'X-Subscription-Token': BRAVE_KEY
      },
      timeout: 8000
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid Brave response')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Brave timeout')); });
    req.end();
  });
}

function callClaude(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid Claude response')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude timeout')); });
    req.write(payload);
    req.end();
  });
}
