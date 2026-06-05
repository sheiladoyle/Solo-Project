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
const BLUEBOOK_VECTOR_INDEX = process.env.BLUEBOOK_VECTOR_INDEX || "bluebook_vector_index";

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
        <title>Luxury Holiday Accommodation Search</title>
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
          <h1>Luxury getaway with activities</h1>
          <form id="searchForm">
            <div class="field">
              <label for="searchText">Free text search</label>
              <input id="searchText" name="searchText" type="text"
                placeholder="e.g. quiet beachfront apartment with pool and parking" />
              <div class="desc">Leave blank for Atlas text search; use amenities/location instead.</div>
            </div>
            <div class="field">
              <label for="amenities">Amenities</label>
              <input id="amenities" name="amenities" type="text" placeholder="e.g. pool, wifi, parking" />
            </div>
            <div class="field">
              <label for="location">Location</label>
              <input id="location" name="location" type="text" placeholder="e.g. Algarve" />
            </div>
            <label class="option">
              <input type="radio" name="mode" value="text" checked />
              <strong>Atlas text search</strong>
              <div class="desc">Uses amenities and location filters only. Free text is disabled for this mode.</div>
            </label>
            <label class="option">
              <input type="radio" name="mode" value="llm_atlas" />
              <strong>Formulate text search using LLM</strong>
              <div class="desc">Passes your free text search to OpenAI to generate an optimal Atlas search query, then returns the top 5 matches from blueBook.</div>
            </label>
            <label class="option">
              <input type="radio" name="mode" value="hybrid" />
              <strong>Vector / Hybrid Search</strong>
              <div class="desc">Uses Voyage AI semantic vector search on the blueBook collection and can filter results by Location when provided.</div>
            </label>
            <label class="option">
              <input type="radio" name="mode" value="llm" />
              <strong>LLM with OpenAI no rag </strong>
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
          const searchTextInput = document.getElementById("searchText");
          const amenitiesField = document.getElementById("amenities");
          const locationField = document.getElementById("location");

          function updateReadOnlyState() {
            const selectedMode = document.querySelector('input[name="mode"]:checked')?.value;
            const isLlm = selectedMode === "llm" || selectedMode === "llm_atlas" || selectedMode === "rag" || selectedMode === "Rag with Voyage AI";
            const isAtlasText = selectedMode === "text";
            searchTextInput.readOnly = isAtlasText;
            searchTextInput.required = !isAtlasText;
            if (isAtlasText) {
              searchTextInput.value = "";
            }
            amenitiesField.readOnly = isLlm;
            locationField.readOnly = isLlm;
            if (isAtlasText) {
              searchTextInput.placeholder = "Free text disabled for Atlas text search";
            } else {
              searchTextInput.placeholder = "e.g. quiet beachfront apartment with pool and parking";
            }
          }
          modeInputs.forEach(input => input.addEventListener("change", updateReadOnlyState));
          updateReadOnlyState();

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const searchText = formData.get("searchText");
            let amenities = formData.get("amenities");
            let location = formData.get("location");
            const mode = formData.get("mode");

            if (mode === "Rag with Voyage AI") {
              amenities = "";
              location = "";
            }

            const payload = { searchText, amenities, location, mode };

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
                      <div class="muted"><strong>Location:</strong> \${item.location}</div>
                      <div class="muted">Sleeps: \${item.sleeps}</div>
                      <div style="margin-top:8px;">\${item.reason}</div>
                    </div>
                  \`).join("")}
                \`;
              } else if (data.mode === "text" || data.mode === "llm_atlas" || data.mode === "hybrid" || data.mode === "Rag with Voyage AI") {
                const title = data.mode === "llm_atlas"
                  ? "Top 5 results from blueBook (LLM-Formulated Search)"
                  : data.mode === "hybrid"
                    ? "Top 5 results from blueBook (Vector / Hybrid Search)"
                    : data.mode === "Rag with Voyage AI"
                      ? "Top 5 results from blueBook (Voyage AI RAG)"
                      : "Top 5 results from blueBook (Atlas Search)";
                if (!data.results || data.results.length === 0) {
                  result.innerHTML = '<div class="muted">No matches found in blueBook.</div>';
                  return;
                }
                result.innerHTML = \`
                 <h3>Best matches</h3>
                  \${data.results.map((item, index) => \`
                    <div class="result-card">
                      <div><strong>\${index + 1}. \${item.name || item.title || "(no name)"}</strong></div>
                      \${item.location ? \`<div class="muted"><strong>Location:</strong> \${item.location}</div>\` : ""}
                      \${item.amenities ? \`<div class="muted"><strong>Amenities:</strong> \${Array.isArray(item.amenities) ? item.amenities.join(", ") : item.amenities}</div>\` : ""}
                      \${item.description ? \`<div style="margin-top:8px;">\${item.description}</div>\` : ""}
                      \${data.mode === "Rag with Voyage AI" && item.localAmenities ? \`<div class="muted" style="margin-top:8px;"><strong>Other amenities in the area:</strong> \${item.localAmenities}</div>\` : ""}
                    </div>
                  \`).join("")}
                \`;
              } else {
                result.innerHTML = \`
                  <h3>Search request received</h3>
                  <div><strong>Mode:</strong> \${data.mode}</div>
                  <div><strong>Free text:</strong> \${data.filters.searchText || "-"}</div>
                  <div><strong>Amenities:</strong> \${data.filters.amenities || "-"}</div>
                  <div><strong>Location:</strong> \${data.filters.location || "-"}</div>
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
  const { searchText, amenities, location, mode } = req.body;

  if (!mode || (mode !== "text" && !searchText)) {
    return res.status(400).json({ error: mode === "text" ? "mode is required" : "searchText and mode are required" });
  }

  // --- Atlas text search branch ---
  if (mode === "text") {
    try {
      if (!blueBookCollection) {
        return res.status(500).json({ error: "MongoDB not initialized" });
      }

      const queryClauses = [];

      if (amenities) {
        queryClauses.push({
          text: {
            query: amenities,
            path: { wildcard: "*" }
          }
        });
      }

      if (location) {
        queryClauses.push({
          text: {
            query: location,
            path: { wildcard: "*" }
          }
        });
      }

      if (!queryClauses.length) {
        return res.status(400).json({ error: "Please provide amenities or location for Atlas text search." });
      }

      const searchStage = {
        $search: {
          index: "bluebook_text_index",
          compound: {
            must: queryClauses
          }
        }
      };

      const pipeline = [
        searchStage,
        { $limit: 5 },
        {
          $project: {
            _id: 1,
            name: 1,
            title: 1,
            location: 1,
            description: 1,
            amenities: 1,
            sleeps: 1,
            score: { $meta: "searchScore" }
          }
        }
      ];

      console.log("Atlas text search pipeline:", JSON.stringify(pipeline, null, 2));
      const results = await blueBookCollection.aggregate(pipeline).toArray();
      return res.json({ mode, results });
    } catch (error) {
      console.error("Atlas Search error:", error);
      return res.status(500).json({ error: "Atlas Search query failed" });
    }
  }

  // --- Semantic vector search with Voyage AI embeddings ---
  if (mode === "hybrid") {
    try {
      if (!blueBookCollection) {
        return res.status(500).json({ error: "MongoDB not initialized" });
      }

      const locationQuery = String(location || "").trim();
      const amenitiesQuery = String(amenities || "").trim();

      const vectorPipeline = [
        {
          $vectorSearch: {
            index: "bluebook_vector_index",
            query: {
              text: searchText
            },
            path: "ragText",
            model: "voyage-4",
            numCandidates: 200,
            limit: 20
          }
        }
      ];

      const textPipeline = [];
      const textMust = [];

      if (amenitiesQuery) {
        textMust.push({
          text: {
            query: amenitiesQuery,
            path: "amenities"
          }
        });
      }

      if (locationQuery) {
        textMust.push({
          text: {
            query: locationQuery,
            path: "location"
          }
        });
      }

      if (textMust.length > 0) {
        textPipeline.push({
          $search: {
            index: "bluebook_text_index",
            compound: {
              must: textMust
            }
          }
        });
        textPipeline.push({ $limit: 20 });
      }

      const rankFusionInput = {
        pipelines: {
          vectorPipeline,
          textPipeline
        }
      };

      const pipeline = [
        {
          $rankFusion: {
            input: rankFusionInput,
            combination: {
              weights: {
                vectorPipeline: 0.7,
                textPipeline: 1.0
              }
            },
            scoreDetails: true
          }
        },
        { $addFields: { scoreDetails: { $meta: "scoreDetails" } } },
        { $limit: 10 },
        {
          $project: {
            _id: 1,
            name: 1,
            title: 1,
            location: 1,
            description: 1,
            amenities: 1,
            sleeps: 1,
            scoreDetails: 1
          }
        }
      ];

      console.log("Hybrid search pipeline:", JSON.stringify(pipeline, null, 2));
      const results = await blueBookCollection.aggregate(pipeline).toArray();
      return res.json({ mode, results });
    } catch (error) {
      console.error("Voyage AI hybrid search error:", error);
      return res.status(500).json({ error: "Hybrid semantic search failed" });
    }
  }

  // --- LLM-Formulated Atlas Search branch ---
  if (mode === "llm_atlas") {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }
    try {
      if (!blueBookCollection) {
        return res.status(500).json({ error: "MongoDB not initialized" });
      }

      const systemPrompt = `
You are an expert in understanding natural language user requests for holiday accommodation searches.
Given a user's free-text search request, extract the location and amenities mentioned by the user.
Return ONLY valid JSON in this format (no additional text):
{
  "location": "string",
  "amenities": "string"
}
If the user does not mention one of the fields, return an empty string for that field.
      `.trim();

      const userPrompt = `
Free text search:
${searchText || ""}

Extract the location and amenities from this request.
      `.trim();

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      const content = completion.choices[0].message.content;
      const extracted = typeof content === "string" ? JSON.parse(content) : content;
      const locationQuery = String(extracted.location || "").trim();
      const amenitiesQuery = String(extracted.amenities || "").trim();
      const searchClauses = [];

      if (locationQuery) {
        searchClauses.push({
          text: {
            query: locationQuery,
            path: "location"
          }
        });
      }

      if (amenitiesQuery) {
        searchClauses.push({
          text: {
            query: amenitiesQuery,
            path: "amenities"
          }
        });
      }

      if (!searchClauses.length) {
        searchClauses.push({
          text: {
            query: searchText || "",
            path: { wildcard: "*" }
          }
        });
      }

      const pipeline = [
        {
          $search: {
            index: "bluebook_text_index",
            compound: {
              must: searchClauses
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
            amenities: 1,
            sleeps: 1,
            score: { $meta: "searchScore" }
          }
        }
      ];

      console.log("LLM Atlas extracted fields:", extracted);
      console.log("LLM Atlas pipeline:", JSON.stringify(pipeline, null, 2));
      const results = await blueBookCollection.aggregate(pipeline).toArray();
      return res.json({ mode, results });
    } catch (error) {
      console.error("LLM Atlas Search error:", error);
      return res.status(500).json({ error: "Failed to formulate and execute Atlas search query" });
    }
  }

  // --- LLM with Voyage AI RAG ---
  if (mode === "Rag with Voyage AI") {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }
    try {
      if (!blueBookCollection) {
        return res.status(500).json({ error: "MongoDB not initialized" });
      }

      const freeTextQuery = String(searchText || "").trim();
      // Ignore amenities and location fields for this mode.
      const pipeline = [
        {
          $vectorSearch: {
            index: BLUEBOOK_VECTOR_INDEX,
            query: {
              text: freeTextQuery
            },
            path: "ragText",
            model: "voyage-4",
            numCandidates: 100,
            limit: 10
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            title: 1,
            location: 1,
            description: 1,
            amenities: 1,
            sleeps: 1,
            ragText: 1,
            score: { $meta: "vectorSearchScore" }
          }
        }
      ];

      console.log("Voyage AI RAG pipeline:", JSON.stringify(pipeline, null, 2));
      const candidates = await blueBookCollection.aggregate(pipeline).toArray();
      if (!candidates.length) {
        return res.status(404).json({
          error: "No suitable RAG candidates found in the blueBook collection.",
          message: "No documents matched your request in the blueBook collection with the current RAG embeddings. Try a broader query or use another search mode."
        });
      }

      const context = candidates.map((item, index) => {
        const parts = [
          `Record ${index + 1}: ${item.name || item.title || "(no name)"}`,
          item.location ? `Location: ${item.location}` : null,
          item.sleeps ? `Sleeps: ${item.sleeps}` : null,
          item.description ? `Description: ${item.description}` : null,
          item.ragText ? `RAG text: ${item.ragText}` : null
        ].filter(Boolean);
        return parts.join("\n");
      }).join("\n\n");

      const systemPrompt = `
You are a holiday accommodation assistant.
Use only the information from the candidate blueBook documents provided below.
Identify the best matches for the user's interests and include other local amenities close to the accommodations.

Also include other nearby activities and amenities in the area, even if they are not directly related to the user's specific search request.
Also return the accommodation price and a phone number when available.
Return valid JSON only in this format:
{
  "results": [
    {
      "name": "string",
      "location": "string",
      "price": "string",
      "phoneNumber": "string",
      "sleeps": "string",
      "reason": "string",
      "localAmenities": "string"
    }
  ]
}
      `.trim();

      const userPrompt = `
User search request:
${freeTextQuery}

Candidate blueBook documents:
${context}

Using only the candidate documents above, provide the 5 best accommodation recommendations, include other nearby activities and amenities in the area, and include price and contact phone number information where available.
      `.trim();

      console.log("Voyage AI RAG user prompt:", userPrompt);
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
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      const results = Array.isArray(parsed.results) ? parsed.results.slice(0, 5) : [];

      const candidateDocs = new Map();
      candidates.forEach((item) => {
        const nameKey = String(item.name || item.title || "").toLowerCase();
        const locationKey = String(item.location || "").toLowerCase();
        if (nameKey) {
          candidateDocs.set(`${nameKey}|${locationKey}`, item);
          if (!candidateDocs.has(nameKey)) {
            candidateDocs.set(nameKey, item);
          }
        }
      });

      const enrichedResults = results.map((item) => {
        const resultNameKey = String(item.name || item.title || "").toLowerCase();
        const resultLocationKey = String(item.location || "").toLowerCase();
        const candidate = candidateDocs.get(`${resultNameKey}|${resultLocationKey}`) || candidateDocs.get(resultNameKey);
        return { ...item, amenities: candidate?.amenities };
      });

      return res.json({ mode, results: enrichedResults });
    } catch (error) {
      console.error("Voyage AI RAG error:", error);
      return res.status(500).json({ error: "Failed to perform Voyage AI RAG search." });
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
Return exactly 5 accommodation suggestions for holiday booking and mention the local amenities that match the users interests.
Prefer fancy, realistic, useful, concise results.
Return valid JSON only in this format:
{
  "results": [
    {
      "name": "string",
      "location": "string",
      "price": "string",
      "sleeps": "string",
      "reason": "string",
      "localAmenities":"string"
    }
  ]
}
      `.trim();

      const userPrompt = `
Holiday accommodation search request:
${searchText}
Return the top 5 matching accommodation options.
      `.trim();

      console.log("LLM prompt:", userPrompt);
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

  // --- LLM with RAG branch ---
  if (mode === "rag") {
    return res.status(400).json({ error: "The blueBook collection has no suitable embeddings for RAG-based search. Please use one of the other search modes or take steps to manually add embeddings." });
  }

  // --- Other modes (placeholder echo) ---
  return res.json({
    mode,
    filters: { searchText, amenities, location }
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



