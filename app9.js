const express = require("express");
const OpenAI = require("openai");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const mongoClient = new MongoClient(process.env.MONGODB_URI);
const DB_NAME = process.env.MONGODB_DB || "sample_airbnb";
const BLUEBOOK_INDEX = process.env.BLUEBOOK_SEARCH_INDEX || "bluebook_text_index";

let blueBookCollection;

async function initMongo() {
  await mongoClient.connect();
  blueBookCollection = mongoClient.db(DB_NAME).collection("blueBook");
  console.log(`Connected to MongoDB db="${DB_NAME}" collection="blueBook"`);
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Holiday Accommodation Search</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f7f7f9; padding: 30px; }
          .container { max-width: 760px; margin: 0 auto; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
          h1 { margin-top: 0; }
          .field { margin-bottom: 12px; }
          .field label { display: block; font-weight: 500; margin-bottom: 6px; }
          .field input { width: 75%; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; }
          .field input[readonly] { background: #f3f4f6; color: #6b7280; cursor: not-allowed; }
          .option { width: 65%; box-sizing: border-box; }
          .option strong { overflow-wrap: break-word; word-break: break-word; }
          .option:hover { border-color: #666; background: #fafafa; }
          .option input[type="radio"] { width: auto; margin-right: 10px; }
          .desc { color: #666; margin-top: 6px; margin-left: 28px; }
          button { margin-top: 16px; padding: 10px 16px; border: none; border-radius: 8px; background: #111827; color: white; cursor: pointer; }
          button:hover { background: #1f2937; }
          #result { margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px; display: none; }
          .result-card { background: white; border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
          .muted { color: #6b7280; font-size: 14px; }
          .error { color: #b91c1c; font-weight: 600; }
          .loading { color: #374151; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Holiday Accommodation Search</h1>
          <form id="searchForm">
            <div class="field">
              <label for="searchText">Free text search</label>
              <input id="searchText" name="searchText" type="text"
                placeholder="e.g. quiet beachfront apartment with pool and parking" required />
            </div>
            <div class="field">
              <label for="numPeople">Number of people</label>
              <input id="numPeople" name="numPeople" type="number" min="1" placeholder="e.g. 4" />
            </div>
            <div class="field">
              <label for="location">Location</label>
              <input id="location" name="location" type="text" placeholder="e.g. Algarve" />
            </div>
            <div class="field">
              <label for="maxPrice">Max price</label>
              <input id="maxPrice" name="maxPrice" type="number" min="0" step="0.01" placeholder="e.g. 250" />
            </div>

            <label class="option">
              <input type="radio" name="mode" value="text" />
              <strong>Atlas text search</strong>
              <div class="desc">Uses an Atlas Search index on the blueBook collection and returns the top 5 matches.</div>
            </label>
            <label class="option">
              <input type="radio" name="mode" value="hybrid" />
              <strong>Vector / Hybrid Search</strong>
              <div class="desc">Reserved for vector or combined keyword + semantic retrieval.</div>
            </label>
            <label class="option">
              <input type="radio" name="mode" value="llm" checked />
              <strong>LLM with OpenAI no rag</strong>
              <div class="desc">Uses only the free text search and asks OpenAI for the top 5 accommodation suggestions.</div>
            </label>
            <label class="option">
              <input type="radio" name="mode" value="rag" />
              <strong>LLM with RAG</strong>
              <div class="desc">Reserved for retrieval-augmented search.</div>
            </label>
            <label class="option">
              <input type="radio" name="mode" value="Rag with Voyage AI" />
              <strong>LLM with Voyage AI RAG</strong>
              <div class="desc">Retrieval-augmented search with Voyage AI.</div>
            </label>

            <button type="submit">Search</button>
          </form>
          <div id="result"></div>
        </div>

        <script>
          const form = document.getElementById("searchForm");
          const result = document.getElementById("result");
          const modeInputs = document.querySelectorAll('input[name="mode"]');
          const numPeople = document.getElementById("numPeople");
          const locationField = document.getElementById("location");
          const maxPrice = document.getElementById("maxPrice");

          function updateReadOnlyState() {
            const selectedMode = document.querySelector('input[name="mode"]:checked')?.value;
            const isLlm = selectedMode === "llm";
            numPeople.readOnly = isLlm;
            locationField.readOnly = isLlm;
            maxPrice.readOnly = isLlm;
          }
          modeInputs.forEach(input => input.addEventListener("change", updateReadOnlyState));
          updateReadOnlyState();

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const payload = {
              searchText: formData.get("searchText"),
              numPeople: formData.get("numPeople"),
              location: formData.get("location"),
              maxPrice: formData.get("maxPrice"),
              mode: formData.get("mode")
            };

            result.style.display = "block";
            result.innerHTML = '<div class="loading">Searching...</div>';

            try {
              const response = await fetch("/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });
              const data = await response.json();

              if (!response.ok) {
                result.innerHTML = '<div class="error">' + (data.error || "Something went wrong") + '</div>';
                return;
              }

              if (data.mode === "llm") {
                result.innerHTML = \`
                  <h3>Top 5 results</h3>
                  \${data.results.map((item, index) => \`
                    <div class="result-card">
                      <div><strong>\${index + 1}. \${item.name}</strong></div>
                      <div class="muted">Location: \${item.location}</div>
                      <div class="muted">Price: \${item.pricePerNight}</div>
                      <div class="muted">Sleeps: \${item.sleeps}</div>
                      <div style="margin-top:8px;">\${item.reason}</div>
                    </div>
                  \`).join("")}
                \`;
              } else if (data.mode === "text") {
                if (!data.results || data.results.length === 0) {
                  result.innerHTML = '<div class="muted">No matches found in blueBook.</div>';
                  return;
                }
                result.innerHTML = \`
                  <h3>Top 5 results from blueBook (Atlas Search)</h3>
                  \${data.results.map((item, index) => \`
                    <div class="result-card">
                      <div><strong>\${index + 1}. \${item.name || item.title || "(no name)"}</strong></div>
                      \${item.location ? \`<div class="muted">Location: \${item.location}</div>\` : ""}
                      \${item.pricePerNight ? \`<div class="muted">Price: \${item.pricePerNight}</div>\` : ""}
                      \${item.sleeps ? \`<div class="muted">Sleeps: \${item.sleeps}</div>\` : ""}
                      \${item.description ? \`<div style="margin-top:8px;">\${item.description}</div>\` : ""}
                      <div class="muted" style="margin-top:6px;">Score: \${item.score?.toFixed?.(3) ?? item.score}</div>
                    </div>
                  \`).join("")}
                \`;
              } else {
                result.innerHTML = \`
                  <h3>Search request received</h3>
                  <div><strong>Mode:</strong> \${data.mode}</div>
                  <div><strong>Free text:</strong> \${data.filters.searchText || "-"}</div>
                  <div><strong>Number of people:</strong> \${data.filters.numPeople || "-"}</div>
                  <div><strong>Location:</strong> \${data.filters.location || "-"}</div>
                  <div><strong>Max price:</strong> \${data.filters.maxPrice || "-"}</div>
                \`;
              }
            } catch (err) {
              result.innerHTML = '<div class="error">Request failed. ' + err.message + '</div>';
            }
          });
        </script>
      </body>
    </html>
  `);
});

app.post("/search", async (req, res) => {
  const { searchText, numPeople, location, maxPrice, mode } = req.body;

  if (!searchText || !mode) {
    return res.status(400).json({ error: "searchText and mode are required" });
  }

  // --- Atlas text search branch ---
  if (mode === "text") {
    try {
      if (!blueBookCollection) {
        return res.status(500).json({ error: "MongoDB not initialized" });
      }

      const pipeline = [
        {
          $search: {
            index: BLUEBOOK_INDEX,
            text: {
              query: searchText,
              path: { wildcard: "*" }
            }
          }
        },
        { $limit: 5 },
        {
          $project: {
            _id: 1,
            name: 1,
            title: 1,
            location: 1,
            description: 1,
            pricePerNight: 1,
            sleeps: 1,
            score: { $meta: "searchScore" }
          }
        }
      ];

      const results = await blueBookCollection.aggregate(pipeline).toArray();
      return res.json({ mode, results });
    } catch (error) {
      console.error("Atlas Search error:", error);
      return res.status(500).json({ error: "Atlas Search query failed" });
    }
  }

  // --- LLM branch (unchanged) ---
  if (mode === "llm") {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }
    try {
      const systemPrompt = `
You are a holiday accommodation assistant.
Use only the user's free-text request.
Return exactly 5 accommodation suggestions for holiday booking.
Prefer fancy, realistic, useful, concise results.
Return valid JSON only in this format:
{
  "results": [
    {
      "name": "string",
      "location": "string",
      "pricePerNight": "string",
      "sleeps": "string",
      "reason": "string"
    }
  ]
}
      `.trim();

      const userPrompt = `
Holiday accommodation search request:
${searchText}
Return the top 5 matching accommodation options.
      `.trim();

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      const content = completion.choices[0].message.content;
      const parsed = JSON.parse(content);
      return res.json({
        mode,
        results: Array.isArray(parsed.results) ? parsed.results.slice(0, 5) : []
      });
    } catch (error) {
      console.error("OpenAI error:", error);
      return res.status(500).json({ error: "Failed to get LLM results" });
    }
  }

  // --- Other modes (placeholder echo) ---
  return res.json({
    mode,
    filters: { searchText, numPeople, location, maxPrice }
  });
});

initMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });

